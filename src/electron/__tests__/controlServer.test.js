import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => {
  const listeners = new Map();
  return {
    listeners,
    ipcMain: {
      emit: (channel, ...args) => {
        for (const listener of listeners.get(channel) || []) listener(...args);
      },
      on: (channel, listener) => {
        const current = listeners.get(channel) || [];
        current.push(listener);
        listeners.set(channel, current);
      },
      removeListener: (channel, listener) => {
        const current = listeners.get(channel) || [];
        listeners.set(
          channel,
          current.filter(item => item !== listener)
        );
      },
    },
    app: { getPath: () => os.tmpdir(), getVersion: () => '0.0.0-test' },
  };
});

vi.mock('electron', () => ({ app: mocks.app, ipcMain: mocks.ipcMain }));

import {
  startControlServer,
  controlSocketPath,
  CONTROL_READY_CHANNEL,
  CONTROL_REPLY_CHANNEL,
} from '@/electron/controlServer';

const waitForSocket = async socketPath => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const stats = fs.lstatSync(socketPath, { throwIfNoEntry: false });
    if (stats?.isSocket()) return stats;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`socket ${socketPath} never appeared`);
};

const send = (socketPath, payload) =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath);
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify(payload)}\n`));
    socket.on('data', chunk => {
      buffer += chunk;
      const index = buffer.indexOf('\n');
      if (index === -1) return;
      socket.destroy();
      resolve(JSON.parse(buffer.slice(0, index)));
    });
    socket.on('error', reject);
  });

const echoReply = payload => {
  mocks.ipcMain.emit(
    CONTROL_REPLY_CHANNEL,
    { sender: { id: 1 } },
    {
      id: payload.id,
      result: { method: payload.method, params: payload.params },
    }
  );
};

let runtimeDir;
let servers;

const startOn = async (
  socketPath,
  reply = echoReply,
  accountWriteAllowed = false,
  markReady = true
) => {
  process.env.XUMP_CONTROL_SOCKET = socketPath;
  const server = startControlServer({
    getWindow: () => ({
      isDestroyed: () => false,
      webContents: { id: 1, send: (_channel, payload) => reply(payload) },
    }),
    getAccountWriteAllowed: () => accountWriteAllowed,
    log: () => {},
  });
  servers.push(server);
  await waitForSocket(socketPath);
  if (markReady)
    mocks.ipcMain.emit(CONTROL_READY_CHANNEL, { sender: { id: 1 } });
  return server;
};

beforeEach(() => {
  runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xump-control-'));
  process.env.XDG_RUNTIME_DIR = runtimeDir;
  servers = [];
});

afterEach(() => {
  for (const server of servers) server.stop();
  mocks.listeners.clear();
  delete process.env.XDG_RUNTIME_DIR;
  delete process.env.XUMP_CONTROL_SOCKET;
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});

describe('control server', () => {
  it('listens on a socket in XDG_RUNTIME_DIR with owner-only permissions', async () => {
    const socketPath = path.join(runtimeDir, 'default.sock');
    const server = await startOn(socketPath);
    expect(server.socketPath).toBe(socketPath);
    const stats = fs.lstatSync(socketPath);
    expect(stats.isSocket()).toBe(true);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('honours XUMP_CONTROL_SOCKET as an explicit path', () => {
    expect(controlSocketPath()).toBe(
      path.join(runtimeDir, 'xump-control.sock')
    );
    process.env.XUMP_CONTROL_SOCKET = path.join(runtimeDir, 'custom.sock');
    expect(controlSocketPath()).toBe(path.join(runtimeDir, 'custom.sock'));
  });

  it('answers ping itself and forwards renderer methods', async () => {
    const socketPath = path.join(runtimeDir, 'default.sock');
    await startOn(socketPath);
    const ping = await send(socketPath, { id: 1, method: 'ping' });
    expect(ping.result).toMatchObject({ ok: true });

    const forwarded = await send(socketPath, {
      id: 7,
      method: 'search',
      params: { keywords: '周杰伦' },
    });
    expect(forwarded).toEqual({
      id: 7,
      result: { method: 'search', params: { keywords: '周杰伦' } },
    });
  });

  it('preserves the renderer error code', async () => {
    const socketPath = path.join(runtimeDir, 'errors.sock');
    await startOn(socketPath, payload => {
      mocks.ipcMain.emit(
        CONTROL_REPLY_CHANNEL,
        { sender: { id: 1 } },
        {
          id: payload.id,
          error: {
            code: 'invalid_params',
            message: 'limit must be an integer',
          },
        }
      );
    });
    const response = await send(socketPath, { id: 2, method: 'status' });
    expect(response.error).toEqual({
      code: 'invalid_params',
      message: 'limit must be an integer',
    });
  });

  it('refuses replies from another sender', async () => {
    const socketPath = path.join(runtimeDir, 'sender.sock');
    await startOn(socketPath, payload => {
      mocks.ipcMain.emit(
        CONTROL_REPLY_CHANNEL,
        { sender: { id: 999 } },
        {
          id: payload.id,
          result: 'from-another-renderer',
        }
      );
      mocks.ipcMain.emit(
        CONTROL_REPLY_CHANNEL,
        { sender: { id: 1 } },
        {
          id: payload.id,
          result: 'from-owner',
        }
      );
    });
    const response = await send(socketPath, { id: 3, method: 'status' });
    expect(response.result).toBe('from-owner');
  });

  it('rejects oversized results instead of truncating them', async () => {
    const socketPath = path.join(runtimeDir, 'big.sock');
    await startOn(socketPath, payload => {
      mocks.ipcMain.emit(
        CONTROL_REPLY_CHANNEL,
        { sender: { id: 1 } },
        {
          id: payload.id,
          result: { blob: 'x'.repeat(100000) },
        }
      );
    });
    const response = await send(socketPath, { id: 4, method: 'status' });
    expect(response.error.code).toBe('result_too_large');
  });

  it('reports unknown methods and invalid JSON', async () => {
    const socketPath = path.join(runtimeDir, 'default.sock');
    await startOn(socketPath);
    const unknown = await send(socketPath, { id: 5, method: 'nope' });
    expect(unknown.error.code).toBe('unknown_method');

    const noMethod = await send(socketPath, { id: 6 });
    expect(noMethod.error.code).toBe('invalid_params');

    const invalid = await new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      socket.setEncoding('utf8');
      socket.on('connect', () => socket.write('{not json}\n'));
      socket.on('data', chunk => {
        socket.destroy();
        resolve(JSON.parse(chunk.toString().trim()));
      });
      socket.on('error', reject);
    });
    expect(invalid.error.code).toBe('invalid_json');
  });

  it('refuses an oversized request line', async () => {
    const socketPath = path.join(runtimeDir, 'default.sock');
    await startOn(socketPath);
    const response = await new Promise((resolve, reject) => {
      const socket = net.createConnection(socketPath);
      socket.setEncoding('utf8');
      socket.on('connect', () => socket.write('a'.repeat(70000)));
      socket.on('data', chunk => {
        socket.destroy();
        resolve(JSON.parse(chunk.toString().trim()));
      });
      socket.on('error', reject);
    });
    expect(response.error.code).toBe('request_too_large');
  });

  it('refuses to steal a socket that another instance owns', async () => {
    const socketPath = path.join(runtimeDir, 'default.sock');
    const owner = await startOn(socketPath);
    const newcomer = startControlServer({
      getWindow: () => null,
      log: () => {},
    });
    servers.push(newcomer);
    await new Promise(resolve => setTimeout(resolve, 50));
    // the original endpoint still answers
    const response = await send(owner.socketPath, { id: 8, method: 'ping' });
    expect(response.result).toMatchObject({ ok: true });
  });

  it('refuses a path that is not a socket', async () => {
    const file = path.join(runtimeDir, 'not-a-socket');
    fs.writeFileSync(file, 'keep me');
    process.env.XUMP_CONTROL_SOCKET = file;
    const refused = startControlServer({
      getWindow: () => null,
      log: () => {},
    });
    servers.push(refused);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(fs.readFileSync(file, 'utf8')).toBe('keep me');
  });

  it('fails fast instead of dropping requests while the UI is starting', async () => {
    const socketPath = path.join(runtimeDir, 'not-ready.sock');
    await startOn(socketPath, echoReply, false, false);
    const response = await send(socketPath, { id: 12, method: 'status' });
    expect(response.error).toEqual({
      code: 'renderer_unavailable',
      message: 'XuMP is still starting up, try again in a moment',
    });

    // once the renderer says it is ready the same request goes through
    mocks.ipcMain.emit(CONTROL_READY_CHANNEL, { sender: { id: 1 } });
    const after = await send(socketPath, { id: 13, method: 'status' });
    expect(after.result).toEqual({ method: 'status', params: {} });
  });

  it('ignores readiness from another renderer', async () => {
    const socketPath = path.join(runtimeDir, 'other-ready.sock');
    await startOn(socketPath, echoReply, false, false);
    mocks.ipcMain.emit(CONTROL_READY_CHANNEL, { sender: { id: 999 } });
    const response = await send(socketPath, { id: 14, method: 'status' });
    expect(response.error.code).toBe('renderer_unavailable');
  });

  it('fails fast when the window is gone', async () => {
    const socketPath = path.join(runtimeDir, 'no-window.sock');
    process.env.XUMP_CONTROL_SOCKET = socketPath;
    const server = startControlServer({ getWindow: () => null, log: () => {} });
    servers.push(server);
    await waitForSocket(socketPath);
    const response = await send(socketPath, { id: 9, method: 'status' });
    expect(response.error.code).toBe('renderer_unavailable');
  });

  it('gates account writes behind an explicit opt-in', async () => {
    const gated = path.join(runtimeDir, 'gated.sock');
    await startOn(gated, echoReply, false);
    const refused = await send(gated, {
      id: 10,
      method: 'like',
      params: { id: 111, liked: true },
    });
    expect(refused.error.code).toBe('account_write_disabled');

    const allowed = path.join(runtimeDir, 'allowed.sock');
    await startOn(allowed, echoReply, true);
    const forwarded = await send(allowed, {
      id: 11,
      method: 'like',
      params: { id: 111, liked: true },
    });
    expect(forwarded.result).toEqual({
      method: 'like',
      params: { id: 111, liked: true },
    });
  });
});

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { app, ipcMain } from 'electron';

// Local control channel for scripts and agents (see scripts/xumpctl.mjs and
// docs/control-api.md). The main process owns a unix socket and forwards
// requests to the renderer, where the player and the authenticated NetEase API
// layer live.

export const CONTROL_REQUEST_CHANNEL = 'control:request';
export const CONTROL_REPLY_CHANNEL = 'control:reply';
export const CONTROL_READY_CHANNEL = 'control:ready';

const SOCKET_FILENAME = 'xump-control.sock';
const RENDERER_TIMEOUT_MS = 45000;
const PROBE_TIMEOUT_MS = 500;
const MAX_LINE_BYTES = 65536;
const MAX_RESULT_BYTES = 98304;
const MAX_CONNECTIONS = 8;
const MAX_INFLIGHT = 32;

// Methods implemented in the renderer: they need the Vuex store, the player or
// the app's API layer.
const RENDERER_METHODS = new Set([
  'status',
  'control',
  'play',
  'enqueue',
  'queue',
  'search',
  'lyrics',
  'recommend',
  'like',
]);

// Methods that change the remote NetEase account (not just local playback):
// they stay behind an explicit opt-in that the app enforces, so a raw socket
// caller cannot bypass it.
const ACCOUNT_WRITE_METHODS = new Set(['like']);

export class ControlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ControlError';
    this.code = code;
  }
}

export function controlSocketPath() {
  const override = process.env.XUMP_CONTROL_SOCKET;
  if (override && override !== '0') return override;
  const base =
    process.env.XDG_RUNTIME_DIR || app.getPath('userData') || os.tmpdir();
  return path.join(base, SOCKET_FILENAME);
}

const probeSocket = socketPath =>
  new Promise(resolve => {
    const socket = net.createConnection(socketPath);
    let settled = false;
    const finish = alive => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(alive);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => finish(false));
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ id: 0, method: 'ping' })}\n`);
    });
    socket.on('data', () => finish(true));
    socket.on('error', () => finish(false));
    socket.on('close', () => finish(false));
  });

// Remove a leftover endpoint, but never a regular file and never a live server.
const claimSocketPath = async socketPath => {
  const existing = fs.lstatSync(socketPath, { throwIfNoEntry: false });
  if (!existing) return;
  if (!existing.isSocket()) {
    throw new ControlError(
      'socket_path_taken',
      `${socketPath} exists and is not a socket`
    );
  }
  if (await probeSocket(socketPath)) {
    throw new ControlError(
      'already_running',
      `another XuMP instance is already listening on ${socketPath}`
    );
  }
  fs.rmSync(socketPath, { force: true });
};

export function startControlServer({
  getWindow,
  getAccountWriteAllowed,
  log = console.log,
} = {}) {
  // The socket listener is platform-gated, but the renderer-forwarding core
  // (and its `handle` dispatch entry) is always created: the built-in MCP
  // HTTP server drives the app through it even where unix sockets are off.
  const socketDisabled =
    process.env.XUMP_CONTROL_SOCKET === '0' || process.platform === 'win32';
  if (socketDisabled) {
    log(
      `[control] socket disabled (${
        process.platform === 'win32'
          ? 'unix sockets are not supported on this platform'
          : 'XUMP_CONTROL_SOCKET=0'
      })`
    );
  }

  const socketPath = socketDisabled ? null : controlSocketPath();
  const pending = new Map();
  const sockets = new Set();
  let seq = 0;
  let inflight = 0;
  let stopped = false;
  let ownedInode = null;
  // the renderer subscribes to CONTROL_REQUEST_CHANNEL when the Vue app mounts;
  // requests sent before that would be dropped, so fail fast until it is ready
  let readyWebContentsId = null;

  const respond = (socket, payload) => {
    if (socket.destroyed) return;
    let line;
    try {
      line = `${JSON.stringify(payload)}\n`;
    } catch (error) {
      line = `${JSON.stringify({
        id: payload?.id ?? null,
        error: { code: 'serialize_failed', message: error.message },
      })}\n`;
    }
    socket.write(line);
  };

  const requestRenderer = (method, params) => {
    const window = getWindow?.();
    if (stopped || !window || window.isDestroyed?.()) {
      return Promise.reject(
        new ControlError('renderer_unavailable', 'XuMP window is not available')
      );
    }
    const id = ++seq;
    const senderId = window.webContents.id;
    if (readyWebContentsId !== senderId) {
      return Promise.reject(
        new ControlError(
          'renderer_unavailable',
          'XuMP is still starting up, try again in a moment'
        )
      );
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new ControlError('timeout', `renderer timed out for "${method}"`)
        );
      }, RENDERER_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer, senderId });
      try {
        window.webContents.send(CONTROL_REQUEST_CHANNEL, {
          id,
          method,
          params: params ?? {},
        });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(new ControlError('renderer_unavailable', error.message));
      }
    });
  };

  const localMethods = {
    ping: () => ({ ok: true, time: Date.now() }),
    version: () => ({
      app: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
    }),
  };

  const handleRequest = async (method, params) => {
    if (typeof method !== 'string' || method === '') {
      throw new ControlError('invalid_params', 'method is required');
    }
    if (Object.hasOwn(localMethods, method)) {
      return localMethods[method](params || {});
    }
    if (!RENDERER_METHODS.has(method)) {
      throw new ControlError('unknown_method', `unknown method "${method}"`);
    }
    if (
      ACCOUNT_WRITE_METHODS.has(method) &&
      getAccountWriteAllowed?.() !== true
    ) {
      throw new ControlError(
        'account_write_disabled',
        `${method} is disabled; enable account writes first (see docs/control-api.md)`
      );
    }
    return requestRenderer(method, params);
  };

  const onConnection = socket => {
    if (stopped || sockets.size >= MAX_CONNECTIONS) {
      respond(socket, {
        id: null,
        error: { code: 'busy', message: 'too many control connections' },
      });
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());

    let buffered = Buffer.alloc(0);
    const consume = async line => {
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        respond(socket, {
          id: null,
          error: { code: 'invalid_json', message: 'invalid JSON request' },
        });
        return;
      }
      const id = request?.id ?? null;
      if (inflight >= MAX_INFLIGHT) {
        respond(socket, {
          id,
          error: { code: 'busy', message: 'too many requests in flight' },
        });
        return;
      }
      inflight += 1;
      try {
        const result = await handleRequest(request?.method, request?.params);
        const json = JSON.stringify(result ?? null);
        if (json.length > MAX_RESULT_BYTES) {
          throw new ControlError(
            'result_too_large',
            `result exceeds ${MAX_RESULT_BYTES} bytes, request a smaller page`
          );
        }
        respond(socket, { id, result: result ?? null });
      } catch (error) {
        const code = error?.code || 'internal_error';
        if (code === 'internal_error') {
          log(`[control] ${request?.method} failed: ${error.message}`);
        }
        respond(socket, {
          id,
          error: { code, message: error?.message || String(error) },
        });
      } finally {
        inflight -= 1;
      }
    };

    socket.on('data', chunk => {
      buffered = Buffer.concat([buffered, chunk]);
      while (true) {
        const index = buffered.indexOf(0x0a);
        if (index === -1) {
          if (buffered.length > MAX_LINE_BYTES) {
            respond(socket, {
              id: null,
              error: {
                code: 'request_too_large',
                message: `request exceeds ${MAX_LINE_BYTES} bytes`,
              },
            });
            socket.destroy();
          }
          return;
        }
        const line = buffered.subarray(0, index).toString('utf8').trim();
        buffered = buffered.subarray(index + 1);
        if (line) void consume(line);
      }
    });
  };

  const onReady = event => {
    const window = getWindow?.();
    if (
      window &&
      !window.isDestroyed?.() &&
      event?.sender?.id === window.webContents.id
    ) {
      readyWebContentsId = event.sender.id;
    }
  };
  ipcMain.on(CONTROL_READY_CHANNEL, onReady);

  const onReply = (event, payload) => {
    const entry = pending.get(payload?.id);
    if (!entry) return;
    // only the renderer that was asked may answer
    if (event?.sender?.id !== entry.senderId) return;
    pending.delete(payload.id);
    clearTimeout(entry.timer);
    if (payload.error) {
      const code =
        typeof payload.error === 'object'
          ? payload.error.code || 'renderer_error'
          : 'renderer_error';
      const message =
        typeof payload.error === 'object'
          ? payload.error.message || JSON.stringify(payload.error)
          : String(payload.error);
      entry.reject(new ControlError(code, message));
    } else {
      entry.resolve(payload.result);
    }
  };
  ipcMain.on(CONTROL_REPLY_CHANNEL, onReply);

  const server = socketDisabled ? null : net.createServer(onConnection);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    ipcMain.removeListener(CONTROL_REPLY_CHANNEL, onReply);
    ipcMain.removeListener(CONTROL_READY_CHANNEL, onReady);
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new ControlError('stopped', 'control server stopped'));
    }
    pending.clear();
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    server?.close();
    if (socketPath) {
      try {
        const current = fs.lstatSync(socketPath, { throwIfNoEntry: false });
        // only unlink the endpoint this server created
        if (current?.isSocket() && current.ino === ownedInode) {
          fs.rmSync(socketPath, { force: true });
        }
      } catch {
        // nothing to clean up
      }
    }
  };

  if (server) {
    server.on('error', error =>
      log(`[control] socket error: ${error.message}`)
    );

    claimSocketPath(socketPath)
      .then(() => {
        server.listen(socketPath, () => {
          try {
            fs.chmodSync(socketPath, 0o600);
            ownedInode = fs.lstatSync(socketPath).ino;
          } catch (error) {
            log(
              `[control] refusing to run without owner-only socket: ${error.message}`
            );
            stop();
            return;
          }
          log(`[control] listening on ${socketPath}`);
        });
      })
      .catch(error => log(`[control] not started: ${error.message}`));
  }

  return {
    socketPath,
    stop,
    // In-process dispatch for built-in MCP HTTP server: same validation,
    // account-write gating and renderer forwarding as the socket path.
    handle: handleRequest,
    markRendererReady: id => {
      readyWebContentsId = id;
    },
  };
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import {
  createMcpServer,
  formatMs,
  MCP_TOOLS,
  parseArgs,
  pickBestMatch,
  request,
  runCommand,
  validateToolArguments,
} from '../xumpctl.mjs';

// Unix sockets cannot be bound everywhere (notably Windows sandboxes), so
// tests use a Windows named pipe there and a tmpdir socket otherwise.
const makeSocketPath = name =>
  process.platform === 'win32'
    ? `\\\\.\\pipe\\${name}-${process.pid}-${Date.now()}`
    : path.join(os.tmpdir(), `${name}-${process.pid}-${Date.now()}.sock`);

const CANNED = {
  status: () => ({
    result: {
      playing: true,
      positionMs: 61000,
      volume: 0.4,
      repeatMode: 'off',
      shuffle: false,
      isPersonalFM: false,
      currentTrack: { id: 347230, name: '海阔天空', artists: ['Beyond'] },
      queue: { playlistTotal: 12, priorityTotal: 0 },
      source: { type: 'playlist', id: 42 },
    },
  }),
  search: () => ({
    result: {
      type: 'song',
      items: [
        { id: 1, name: '海阔天空', artists: 'コピー', album: 'covers' },
        { id: 347230, name: '海阔天空', artists: 'Beyond', album: '海阔天空' },
      ],
      total: 2,
      offset: 0,
      limit: 5,
      nextOffset: null,
    },
  }),
  play: request => ({
    result: {
      accepted: true,
      target: { type: 'track', id: request.params.id },
    },
  }),
  queue: () => ({
    result: {
      playlist: {
        items: [1, 2, 3],
        total: 3,
        offset: 0,
        limit: 5,
        nextOffset: null,
      },
      priority: { items: [], total: 0, offset: 0, limit: 5, nextOffset: null },
      currentIndex: 0,
      shuffle: false,
      repeatMode: 'off',
      source: { type: 'playlist', id: 42 },
    },
  }),
};

const createIo = () => {
  const lines = [];
  return {
    lines,
    log: (...args) => lines.push(args.join(' ')),
    error: (...args) => lines.push(args.join(' ')),
  };
};

let dir;
let server;
let socketPath;
let requests;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xumpctl-'));
  socketPath = makeSocketPath('xumpctl');
  requests = [];
  server = net.createServer(socket => {
    socket.setEncoding('utf8');
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const request = JSON.parse(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        requests.push(request);
        const handler = CANNED[request.method];
        const reply = handler
          ? handler(request)
          : {
              id: request.id,
              error: { code: 'unknown_method', message: 'nope' },
            };
        socket.write(`${JSON.stringify({ id: request.id, ...reply })}\n`);
        index = buffer.indexOf('\n');
      }
    });
  });
  await new Promise(resolve => server.listen(socketPath, resolve));
});

afterEach(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('xumpctl argument parsing', () => {
  it('treats --json as a boolean flag', () => {
    const { flags, positional } = parseArgs(['--json', 'status']);
    expect(flags.get('json')).toBe(true);
    expect(positional).toEqual(['status']);
  });

  it('reads values for value flags', () => {
    const { flags, positional } = parseArgs([
      'queue',
      '--limit',
      '20',
      '--offset=5',
    ]);
    expect(flags.get('limit')).toBe('20');
    expect(flags.get('offset')).toBe('5');
    expect(positional).toEqual(['queue']);
  });

  it('rejects unknown flags and missing values', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown flag/);
    expect(() => parseArgs(['--limit'])).toThrow(/needs a value/);
  });
});

describe('xumpctl helpers', () => {
  it('clamps negative lyric times to zero', () => {
    expect(formatMs(-1000)).toBe('0:00');
    expect(formatMs(61000)).toBe('1:01');
    expect(formatMs(undefined)).toBe('--:--');
  });

  it('prefers the exact title, then the artist named in the query', () => {
    const results = [
      { id: 1, name: '晴天 (深情版)', artists: 'Lucky小爱' },
      { id: 2, name: '晴天', artists: 'RyaVocal' },
      { id: 3, name: '晴天', artists: '周杰伦' },
    ];
    expect(pickBestMatch(results, '晴天').id).toBe(2);
    expect(pickBestMatch(results, '周杰伦 晴天').id).toBe(3);
    expect(pickBestMatch(results, '随便').id).toBe(1);
    expect(pickBestMatch([], 'x')).toBeNull();
  });
});

describe('xumpctl commands', () => {
  it('prints a status summary', async () => {
    const io = createIo();
    await runCommand(['status', '--socket', socketPath], io);
    expect(requests[0].method).toBe('status');
    expect(io.lines.join('\n')).toContain('海阔天空 — Beyond [347230]');
    expect(io.lines.join('\n')).toContain('queue 12 track(s) + 0 up next');
  });

  it('prints JSON when asked, without swallowing the subcommand', async () => {
    const io = createIo();
    await runCommand(['--json', 'status', '--socket', socketPath], io);
    const parsed = JSON.parse(io.lines.join('\n'));
    expect(parsed.currentTrack.id).toBe(347230);
  });

  it('searches and plays the best match for a query', async () => {
    const io = createIo();
    await runCommand(
      ['play', 'Beyond', '海阔天空', '--socket', socketPath],
      io
    );
    expect(requests.map(item => item.method)).toEqual(['search', 'play']);
    expect(requests[0].params).toMatchObject({
      keywords: 'Beyond 海阔天空',
      limit: 5,
    });
    expect(requests[1].params).toEqual({ id: 347230 });
  });

  it('passes page parameters through', async () => {
    await runCommand(
      ['queue', '--limit', '5', '--socket', socketPath],
      createIo()
    );
    expect(requests[0].params).toEqual({ limit: 5 });
  });

  it('surfaces socket error codes', async () => {
    await expect(request('nope', {}, { socketPath })).rejects.toMatchObject({
      code: 'unknown_method',
    });
  });

  it('rejects invalid usage before touching the socket', async () => {
    await expect(
      runCommand(['volume', '200', '--socket', socketPath], createIo())
    ).rejects.toMatchObject({
      code: 'invalid_usage',
    });
    await expect(
      runCommand(['shuffle', 'maybe', '--socket', socketPath], createIo())
    ).rejects.toMatchObject({
      code: 'invalid_usage',
    });
    await expect(
      runCommand(['lyrics', 'abc', '--socket', socketPath], createIo())
    ).rejects.toMatchObject({
      code: 'invalid_usage',
    });
    expect(requests).toHaveLength(0);
  });

  it('reports a missing app clearly', async () => {
    await expect(
      request('status', {}, { socketPath: path.join(dir, 'missing.sock') })
    ).rejects.toMatchObject({ code: 'app_not_running' });
  });
});

describe('xumpctl MCP adapter', () => {
  const connect = socketPath => {
    const lines = [];
    const server = createMcpServer({
      socketPath,
      write: line => lines.push(JSON.parse(line)),
    });
    const send = async message => {
      await server.handle(JSON.stringify(message));
      return lines.length;
    };
    const last = () => lines[lines.length - 1];
    return { lines, send, last, server };
  };

  it('negotiates a supported protocol version and refuses to fake unknown ones', async () => {
    const { send, last } = connect(socketPath);
    await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        clientInfo: { name: 'test', version: '0' },
      },
    });
    expect(last().result.protocolVersion).toBe('2025-03-26');
    expect(last().result.serverInfo.name).toBe('xump');

    const other = connect(socketPath);
    await other.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { protocolVersion: '1900-01-01' },
    });
    expect(other.last().result.protocolVersion).toBe('2025-06-18');
  });

  it('validates the JSON-RPC envelope', async () => {
    const { send, last, server } = connect(socketPath);
    await send({ jsonrpc: '1.0', id: 1, method: 'initialize' });
    expect(last().error.code).toBe(-32600);

    await send({ jsonrpc: '2.0', id: 2 });
    expect(last().error.code).toBe(-32600);

    const missingVersion = connect(socketPath);
    await missingVersion.send({
      jsonrpc: '2.0',
      id: 3,
      method: 'initialize',
      params: {},
    });
    expect(missingVersion.last().error.code).toBe(-32602);

    await server.handle('not json');
    expect(last().error.code).toBe(-32700);
  });

  it('requires initialize before other requests and answers ping anyway', async () => {
    const { send, last } = connect(socketPath);
    await send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(last().error.code).toBe(-32002);

    await send({ jsonrpc: '2.0', id: 2, method: 'ping' });
    expect(last().result).toEqual({});
  });

  it('lists every tool and never replies to notifications', async () => {
    const { lines, send, last } = connect(socketPath);
    await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    });
    await send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const before = lines.length;
    await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(last().result.tools).toHaveLength(MCP_TOOLS.length);
    expect(last().result.tools.map(tool => tool.name)).toContain('music_play');

    // a notification-shaped tool call must not execute and must not be answered
    await send({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'music_control', arguments: { action: 'next' } },
    });
    expect(lines.length).toBe(before + 1);
    expect(requests).toHaveLength(0);
  });

  it('rejects bad tool arguments with -32602', async () => {
    const { send, last } = connect(socketPath);
    await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    });
    await send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'nope' },
    });
    expect(last().error.code).toBe(-32602);

    await send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'music_control', arguments: { action: 'teleport' } },
    });
    expect(last().error.code).toBe(-32602);

    await send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'music_lyrics', arguments: { id: 'abc' } },
    });
    expect(last().error.code).toBe(-32602);

    await send({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'music_lyrics', arguments: { id: 1, extra: true } },
    });
    expect(last().error.code).toBe(-32602);
    expect(requests).toHaveLength(0);
  });

  it('returns structuredContent only for object results and isError for failures', async () => {
    const { send, last } = connect(socketPath);
    await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    });

    await send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'music_status', arguments: {} },
    });
    expect(last().result.structuredContent).toMatchObject({ playing: true });
    expect(last().result.structuredContent).not.toBeInstanceOf(Array);

    await send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'music_search', arguments: { query: '海阔天空' } },
    });
    expect(last().result.structuredContent).toMatchObject({ type: 'song' });

    // a tool whose socket answer is an error becomes an isError result
    await send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'music_like', arguments: { id: 1, liked: true } },
    });
    expect(last().result.isError).toBe(true);
    expect(last().result.content[0].text).toContain('unknown_method');
  });

  it('validates schemas the same way the tools declare them', () => {
    const control = MCP_TOOLS.find(tool => tool.name === 'music_control');
    expect(
      validateToolArguments(control.inputSchema, { action: 'next' })
    ).toEqual([]);
    expect(validateToolArguments(control.inputSchema, {})).toContain(
      'missing required argument "action"'
    );
    expect(
      validateToolArguments(control.inputSchema, { action: 'next', extra: 1 })
    ).toContain('unknown argument "extra"');
    const search = MCP_TOOLS.find(tool => tool.name === 'music_search');
    expect(
      validateToolArguments(search.inputSchema, { query: 'x', limit: 99 })
    ).toContain('"limit" must be <= 50');
  });

  it('exposes queue manipulation and assistant tools with correct dispatch', () => {
    const calls = [];
    const call = (method, params) => {
      calls.push({ method, params });
      return Promise.resolve({ result: {} });
    };

    const queue = MCP_TOOLS.find(tool => tool.name === 'music_queue');
    queue.handler({ action: 'move', queue: 'priority', from: 0, to: 2 }, call);
    expect(calls.at(-1)).toEqual({
      method: 'control',
      params: { type: 'queueMove', queue: 'priority', from: 0, to: 2 },
    });
    queue.handler({ action: 'clear', queue: 'upcoming' }, call);
    expect(calls.at(-1)).toEqual({
      method: 'control',
      params: { type: 'queueClear', queue: 'upcoming' },
    });
    expect(
      validateToolArguments(queue.inputSchema, { action: 'teleport' })
    ).not.toEqual([]);

    const preferences = MCP_TOOLS.find(
      tool => tool.name === 'music_preferences'
    );
    preferences.handler(
      { action: 'add', layer: 'longTerm', rule: { rule: '不要现场版' } },
      call
    );
    expect(calls.at(-1)).toEqual({
      method: 'preferences.patch',
      params: { layer: 'longTerm', rule: { rule: '不要现场版' } },
    });
    preferences.handler({ action: 'get' }, call);
    expect(calls.at(-1)).toEqual({
      method: 'preferences.get',
      params: undefined,
    });
    expect(
      validateToolArguments(preferences.inputSchema, {
        action: 'add',
        layer: 'forever',
      })
    ).not.toEqual([]);

    const feedback = MCP_TOOLS.find(tool => tool.name === 'music_feedback');
    feedback.handler({ action: 'report', text: '少点慢歌' }, call);
    expect(calls.at(-1)).toEqual({
      method: 'feedback',
      params: { type: 'text', text: '少点慢歌', trackId: undefined },
    });
    feedback.handler({ action: 'list', since: 5, limit: 10 }, call);
    expect(calls.at(-1)).toEqual({
      method: 'feedback.list',
      params: { since: 5, limit: 10 },
    });
    expect(
      validateToolArguments(feedback.inputSchema, { type: 'explode' })
    ).not.toEqual([]);
  });
});

describe('xumpctl retry policy', () => {
  it('retries read-only calls that raced the app startup, but never writes', async () => {
    const attempts = [];
    let started = false;
    const flaky = net.createServer(socket => {
      socket.setEncoding('utf8');
      let buffer = '';
      socket.on('data', chunk => {
        buffer += chunk;
        let index = buffer.indexOf('\n');
        while (index !== -1) {
          const request = JSON.parse(buffer.slice(0, index));
          buffer = buffer.slice(index + 1);
          attempts.push(request.method);
          if (!started) {
            started = true;
            socket.write(
              `${JSON.stringify({
                id: request.id,
                error: {
                  code: 'renderer_unavailable',
                  message: 'still starting',
                },
              })}\n`
            );
          } else {
            socket.write(
              `${JSON.stringify({ id: request.id, result: { ok: true } })}\n`
            );
          }
          index = buffer.indexOf('\n');
        }
      });
    });
    const flakyPath = makeSocketPath('xumpctl-flaky');
    await new Promise(resolve => flaky.listen(flakyPath, resolve));
    try {
      await expect(
        request('status', {}, { socketPath: flakyPath })
      ).resolves.toEqual({ ok: true });
      expect(attempts).toEqual(['status', 'status']);

      attempts.length = 0;
      started = false;
      await expect(
        request('play', { id: 1 }, { socketPath: flakyPath })
      ).rejects.toMatchObject({ code: 'renderer_unavailable' });
      expect(attempts).toEqual(['play']);
    } finally {
      await new Promise(resolve => flaky.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('xumpctl raw passthrough', () => {
  it('sends an arbitrary method and validates the payload', async () => {
    await runCommand(
      [
        'raw',
        '{"method":"queue","params":{"limit":5}}',
        '--socket',
        socketPath,
      ],
      createIo()
    );
    expect(requests[0]).toMatchObject({
      method: 'queue',
      params: { limit: 5 },
    });
    await expect(
      runCommand(['raw', 'nope', '--socket', socketPath], createIo())
    ).rejects.toMatchObject({ code: 'invalid_usage' });
  });
});

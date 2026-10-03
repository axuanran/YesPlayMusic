import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import {
  formatMs,
  parseArgs,
  pickBestMatch,
  request,
  runCommand,
} from '../xumpctl.mjs';

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
  socketPath = path.join(dir, 'fake.sock');
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

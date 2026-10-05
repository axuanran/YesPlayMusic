import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { startMcpHttpServer } from '../xump-mcp-http.mjs';

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
};

let dir;
let controlServer;
let controlSocketPath;
let requests;
let httpHandle;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xump-mcp-http-'));
  controlSocketPath = makeSocketPath('xump-mcp-http');
  requests = [];
  controlServer = net.createServer(socket => {
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
  await new Promise(resolve => controlServer.listen(controlSocketPath, resolve));
  httpHandle = await startMcpHttpServer({
    socketPath: controlSocketPath,
    port: 0,
  });
});

afterEach(async () => {
  await httpHandle.close();
  await new Promise(resolve => controlServer.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
});

const post = (body, headers = {}) =>
  fetch(httpHandle.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const initialize = () =>
  post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18' },
  });

describe('xump-mcp-http (streamable HTTP transport)', () => {
  it('serves MCP over a single /mcp endpoint', async () => {
    const response = await initialize();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    const message = await response.json();
    expect(message.result.protocolVersion).toBe('2025-06-18');
    expect(message.result.serverInfo.name).toBe('xump');
  });

  it('negotiates a supported MCP-Protocol-Version header', async () => {
    const response = await initialize();
    expect(response.status).toBe(200);
    const ok = await post(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'ping',
      },
      { 'MCP-Protocol-Version': '2025-03-26' }
    );
    expect(ok.status).toBe(200);
    const rejected = await post(
      { jsonrpc: '2.0', id: 3, method: 'ping' },
      { 'MCP-Protocol-Version': '1900-01-01' }
    );
    expect(rejected.status).toBe(400);
  });

  it('lists tools and calls them with structuredContent results', async () => {
    await initialize();
    const list = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const listed = await list.json();
    expect(listed.result.tools.map(tool => tool.name)).toContain('music_play');

    const call = await post({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'music_status', arguments: {} },
    });
    const called = await call.json();
    expect(called.result.structuredContent).toMatchObject({ playing: true });
    expect(called.result.structuredContent).not.toBeInstanceOf(Array);
    expect(requests.map(request => request.method)).toContain('status');
  });

  it('answers notifications with 202 and never executes tool calls', async () => {
    await initialize();
    const response = await post({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });
    expect(response.status).toBe(202);

    const sneaky = await post({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: 'music_control', arguments: { action: 'next' } },
    });
    expect(sneaky.status).toBe(202);
    expect(requests).toHaveLength(0);
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await post('not json at all');
    expect(response.status).toBe(400);
  });

  it('rejects clients that accept neither JSON nor SSE with 406', async () => {
    const response = await fetch(httpHandle.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/html' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(response.status).toBe(406);
  });

  it('answers GET/DELETE with 405 and unknown paths with 404', async () => {
    const get = await fetch(httpHandle.url, {
      headers: { Accept: 'text/event-stream' },
    });
    expect(get.status).toBe(405);

    const del = await fetch(httpHandle.url, { method: 'DELETE' });
    expect(del.status).toBe(405);

    const missing = await fetch(`${httpHandle.url}/elsewhere`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(missing.status).toBe(404);
  });

  it('handles CORS preflights for browser-based clients', async () => {
    const response = await fetch(httpHandle.url, { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toContain(
      'POST'
    );
  });

  it('maps control-socket tool failures to isError results', async () => {
    await initialize();
    const failing = await post({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'music_like', arguments: { id: 1, liked: true } },
    });
    const called = await failing.json();
    expect(called.result.isError).toBe(true);
    expect(called.result.content[0].text).toContain('unknown_method');
  });
});

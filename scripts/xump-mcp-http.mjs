#!/usr/bin/env node
// xump-mcp-http - Streamable HTTP transport for the xump MCP server.
//
//   node scripts/xump-mcp-http.mjs [--host 127.0.0.1] [--port 27233] [--socket <path>]
//
// Serves the same tools as `xumpctl mcp` at a single /mcp endpoint so MCP
// clients that cannot spawn stdio subprocesses (DSH dsh-mcp-client, remote
// agents, ...) can control the running XuMP instance. Stateless: every POST
// carries a complete JSON-RPC message and the server never allocates
// mcp-session-ids, so GET (SSE) and DELETE answer 405 by design.

import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createMcpServer, MCP_PROTOCOL_VERSIONS, parseArgs } from './xumpctl.mjs';

export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_PORT = 27233;
export const MCP_PATH = '/mcp';

const MAX_BODY_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120000;

const applyCors = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Accept, MCP-Protocol-Version, mcp-session-id, Last-Event-ID'
  );
};

const readBody = req =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(
          Object.assign(new Error('request body too large'), {
            code: 'body_too_large',
          })
        );
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

export const startMcpHttpServer = async ({
  socketPath,
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  // optional in-process dispatch override (see createMcpServer in xumpctl.mjs)
  call = null,
} = {}) => {
  // One shared protocol engine; overlapping HTTP requests stay independent
  // because responses are correlated by JSON-RPC id.
  const pending = new Map();
  const engine = createMcpServer({
    socketPath,
    call,
    write: line => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      const resolve = pending.get(message.id);
      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
    },
  });

  const invoke = body =>
    new Promise((resolve, reject) => {
      let message;
      try {
        message = JSON.parse(body);
      } catch {
        reject(
          Object.assign(new Error('request body is not valid JSON'), {
            code: 'bad_json',
          })
        );
        return;
      }
      // Notifications are accepted fire-and-forget (HTTP 202); the engine
      // still sees them (e.g. notifications/initialized) but never replies.
      if (
        message === null ||
        typeof message !== 'object' ||
        Array.isArray(message) ||
        message.id === undefined ||
        message.id === null
      ) {
        engine.handle(body).catch(() => {});
        resolve(null);
        return;
      }
      const id = message.id;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Object.assign(new Error('request timed out'), { code: 'timeout' }));
      }, REQUEST_TIMEOUT_MS);
      pending.set(id, response => {
        clearTimeout(timer);
        resolve(response);
      });
      engine.handle(body).catch(error => {
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });

  const server = http.createServer((req, res) => {
    applyCors(req, res);
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== MCP_PATH) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'GET') {
      // Stateless server: no server-initiated streams.
      res
        .writeHead(405, { Allow: 'POST, OPTIONS' })
        .end('GET is not supported: stateless server has no event stream');
      return;
    }
    if (req.method === 'DELETE') {
      res
        .writeHead(405, { Allow: 'POST, OPTIONS' })
        .end('DELETE is not supported: stateless server has no sessions');
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST, OPTIONS' }).end();
      return;
    }

    const accept = String(req.headers.accept || '');
    if (
      !accept.includes('application/json') &&
      !accept.includes('text/event-stream')
    ) {
      res
        .writeHead(406, { 'Content-Type': 'text/plain' })
        .end('Accept must allow application/json or text/event-stream');
      return;
    }

    const protocolVersion = req.headers['mcp-protocol-version'];
    if (
      typeof protocolVersion === 'string' &&
      protocolVersion !== '' &&
      !MCP_PROTOCOL_VERSIONS.includes(protocolVersion)
    ) {
      res
        .writeHead(400, { 'Content-Type': 'text/plain' })
        .end(`unsupported MCP-Protocol-Version: ${protocolVersion}`);
      return;
    }

    readBody(req)
      .then(async body => {
        if (body.trim() === '') {
          res.writeHead(400, { 'Content-Type': 'text/plain' }).end('empty body');
          return;
        }
        let response;
        try {
          response = await invoke(body);
        } catch (error) {
          const status =
            error.code === 'bad_json'
              ? 400
              : error.code === 'timeout'
                ? 504
                : error.code === 'body_too_large'
                  ? 413
                  : 500;
          res
            .writeHead(status, { 'Content-Type': 'text/plain' })
            .end(error.message || 'internal error');
          return;
        }
        if (response === null) {
          res.writeHead(202).end();
          return;
        }
        res
          .writeHead(200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify(response));
      })
      .catch(() => {
        if (!res.headersSent) res.writeHead(500).end();
      });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return {
    host: address.address,
    port: address.port,
    url: `http://${host}:${address.port}${MCP_PATH}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
};

const main = async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const host = flags.get('host') || DEFAULT_HOST;
  const port = Number(flags.get('port') || DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`xump-mcp-http: invalid --port "${flags.get('port')}"`);
    process.exitCode = 1;
    return;
  }
  try {
    const handle = await startMcpHttpServer({
      socketPath: flags.get('socket'),
      host,
      port,
    });
    console.log(`[mcp-http] xump MCP listening on ${handle.url}`);
    await new Promise(() => {});
  } catch (error) {
    console.error(`xump-mcp-http: ${error.message}`);
    process.exitCode = 1;
  }
};

// `__XUMP_BUNDLED__` is defined by electron-vite when this file is bundled
// into the desktop app's main process; the self-exec guard must not fire
// there (typeof keeps plain node / vitest runs working unchanged).
if (
  typeof __XUMP_BUNDLED__ === 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  void main();
}

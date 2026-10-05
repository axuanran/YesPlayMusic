#!/usr/bin/env node
// xumpctl - drive a running XuMP instance over its local control socket
// (see docs/control-api.md for the protocol).
//
//   xumpctl status
//   xumpctl play "Beyond 海阔天空"      # search, then play the first sensible hit
//   xumpctl play --album 18857
//   xumpctl queue --limit 20
//   xumpctl search "海阔天空" --type album --json
//   xumpctl lyrics 347230 --offset 0 --limit 50

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const REQUEST_TIMEOUT_MS = 60000;
const MAX_PAGE = 256;

const HELP = `xumpctl - control a running XuMP instance

usage:
  xumpctl status
  xumpctl play <query | song id>            play something now (song from anywhere)
  xumpctl play --playlist <id> | --album <id> | --artist <id>
  xumpctl pause | next | prev | stop | toggle
  xumpctl volume <0-100> | seek <seconds>
  xumpctl repeat <off|on|one> | shuffle <on|off>
  xumpctl queue [--offset N] [--limit N]
  xumpctl search <query> [--type song|album|artist|playlist] [--limit N] [--offset N]
  xumpctl lyrics <song id> [--offset N] [--limit N]
  xumpctl mcp                               run as an MCP server over stdio
  xumpctl mcp-http [--host H] [--port P]    run as an MCP server over streamable HTTP
  xumpctl raw '{"method":"status"}'         send a raw request (debugging)

flags:
  --json              print the raw JSON result (also for errors)
  --socket <path>     talk to a specific control socket
  --limit/--offset    page sizes for queue/search/lyrics (max ${MAX_PAGE})
  --host/--port       streamable HTTP bind address (default 127.0.0.1:27233)

The socket lives at $XDG_RUNTIME_DIR/xump-control.sock unless XUMP_CONTROL_SOCKET
overrides it. CLI output is English; the app UI has its own translations.
`;

const BOOLEAN_FLAGS = new Set(['json', 'help', 'playlist-next']);
const VALUE_FLAGS = new Set([
  'socket',
  'host',
  'port',
  'playlist',
  'album',
  'artist',
  'limit',
  'offset',
  'type',
]);

export const parseArgs = argv => {
  const flags = new Map();
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split('=');
    if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, inline === undefined ? true : inline !== 'false');
      continue;
    }
    if (!VALUE_FLAGS.has(name)) {
      throw Object.assign(new Error(`unknown flag "--${name}"`), {
        code: 'invalid_usage',
      });
    }
    if (inline !== undefined) {
      flags.set(name, inline);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined) {
      throw Object.assign(new Error(`--${name} needs a value`), {
        code: 'invalid_usage',
      });
    }
    flags.set(name, next);
    index += 1;
  }
  return { flags, positional };
};

export const formatMs = ms => {
  if (!Number.isFinite(ms)) return '--:--';
  // NetEase uses negative offsets for the credit lines ("作词: ...")
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// A plain "first search hit" happily returns covers and karaoke versions, so
// prefer results whose artist or exact title is mentioned in the query.
export const pickBestMatch = (results, query) => {
  if (!Array.isArray(results) || results.length === 0) return null;
  const text = String(query || '').toLowerCase();
  const exactTitle = results.find(
    result => String(result.name || '').toLowerCase() === text
  );
  if (exactTitle) return exactTitle;
  const artistMatch = results.find(result => {
    const artists = Array.isArray(result.artists)
      ? result.artists
      : String(result.artists || '').split(/[,/]/);
    return artists.some(artist => {
      const name = String(artist || '')
        .trim()
        .toLowerCase();
      return name.length > 1 && text.includes(name);
    });
  });
  return artistMatch || results[0];
};

const isId = value => /^\d+$/.test(String(value ?? ''));

export const socketCandidates = () => {
  const candidates = [];
  if (process.env.XUMP_CONTROL_SOCKET) {
    candidates.push(process.env.XUMP_CONTROL_SOCKET);
  }
  if (process.env.XDG_RUNTIME_DIR) {
    candidates.push(
      path.join(process.env.XDG_RUNTIME_DIR, 'xump-control.sock')
    );
  }
  const home = os.homedir();
  if (process.platform === 'darwin') {
    candidates.push(
      path.join(home, 'Library/Application Support/xump/xump-control.sock')
    );
  } else {
    candidates.push(path.join(home, '.config/xump/xump-control.sock'));
  }
  return candidates;
};

export const findSocket = () => {
  const explicit = process.env.XUMP_CONTROL_SOCKET;
  // Trust an explicit path without stat probing: fs.statSync().isSocket()
  // cannot see Windows named pipes, and a stale path still fails the same
  // way on connect (app_not_running).
  if (explicit) return explicit;
  const candidates = socketCandidates();
  const existing = candidates.filter(candidate => {
    try {
      return fs.statSync(candidate).isSocket();
    } catch {
      return false;
    }
  });
  if (existing.length === 0) {
    throw Object.assign(
      new Error(
        `XuMP control socket not found (looked in ${candidates.join(
          ', '
        )}). Is XuMP running?`
      ),
      { code: 'app_not_running' }
    );
  }
  return existing[0];
};

let requestId = 0;

// Read-only methods may be retried: the first call after a cold start can be
// slow while the app warms up its NetEase session. Writes are never retried.
const RETRYABLE = new Set([
  'ping',
  'version',
  'status',
  'queue',
  'search',
  'lyrics',
]);

const requestOnce = (method, params, socketPath) =>
  new Promise((resolve, reject) => {
    let target = socketPath;
    try {
      target = target || findSocket();
    } catch (error) {
      reject(error);
      return;
    }
    const socket = net.createConnection(target);
    let buffer = '';
    let settled = false;
    const id = ++requestId;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish(
          Object.assign(
            new Error(
              `timed out after ${REQUEST_TIMEOUT_MS}ms (XuMP may still be warming up, try again)`
            ),
            { code: 'timeout' }
          )
        ),
      REQUEST_TIMEOUT_MS
    );
    socket.setEncoding('utf8');
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    socket.on('data', chunk => {
      buffer += chunk;
      const index = buffer.indexOf('\n');
      if (index === -1) return;
      try {
        const response = JSON.parse(buffer.slice(0, index));
        if (response.error) {
          finish(
            Object.assign(
              new Error(response.error.message || 'request failed'),
              {
                code: response.error.code || 'error',
              }
            )
          );
        } else {
          finish(null, response.result);
        }
      } catch {
        finish(
          Object.assign(new Error('invalid response from XuMP'), {
            code: 'protocol_error',
          })
        );
      }
    });
    socket.on('error', error => {
      const missing = error.code === 'ENOENT';
      finish(
        Object.assign(
          new Error(
            missing
              ? `no control socket at ${target} (is XuMP running?)`
              : `socket error: ${error.message}`
          ),
          { code: missing ? 'app_not_running' : 'transport_error' }
        )
      );
    });
    socket.on('close', () => {
      finish(
        Object.assign(
          new Error('connection closed before a response arrived'),
          {
            code: 'transport_error',
          }
        )
      );
    });
  });

const RETRY_DELAY_MS = 400;
const MAX_RETRIES = 3;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const request = async (method, params = {}, options = {}) => {
  const retryable = RETRYABLE.has(method);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestOnce(method, params, options.socketPath);
    } catch (error) {
      const worthRetrying =
        retryable &&
        (error.code === 'timeout' || error.code === 'renderer_unavailable');
      if (!worthRetrying || attempt >= MAX_RETRIES) throw error;
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
};

const describeTrack = track => {
  if (!track) return '(nothing)';
  const artists = Array.isArray(track.artists)
    ? track.artists.join(', ')
    : track.artists || '';
  return `${track.name}${artists ? ` — ${artists}` : ''}${
    track.id ? ` [${track.id}]` : ''
  }`;
};

const printStatus = (status, io) => {
  io.log(
    `${status.playing ? '▶ playing' : '⏸ paused'} ${describeTrack(status.currentTrack)}`
  );
  io.log(
    `position ${formatMs(status.positionMs)}  volume ${Math.round(
      (status.volume ?? 0) * 100
    )}%  repeat ${status.repeatMode}  shuffle ${status.shuffle ? 'on' : 'off'}${
      status.isPersonalFM ? '  (personal FM)' : ''
    }`
  );
  io.log(
    `queue ${status.queue?.playlistTotal ?? 0} track(s) + ${
      status.queue?.priorityTotal ?? 0
    } up next from ${status.source?.type || 'unknown'}${
      status.liked === undefined ? '' : status.liked ? '  ♥ liked' : ''
    }`
  );
};

const printPage = (page, describe, io) => {
  if (!page || page.total === 0) {
    io.log('(no results)');
    return;
  }
  page.items.forEach((item, index) => {
    io.log(`${String(page.offset + index + 1).padStart(3)}. ${describe(item)}`);
  });
  if (page.nextOffset !== null && page.nextOffset !== undefined) {
    io.log(`     ... ${page.total} total, next --offset ${page.nextOffset}`);
  }
};

const trackLine = track =>
  `${track.name}${track.artists ? `  (${track.artists})` : ''}${
    track.album ? ` • ${track.album}` : ''
  }  [${track.id}]`;

// ---------------------------------------------------------------------------
// MCP over stdio
// ---------------------------------------------------------------------------

export const MCP_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26'];
const SERVER_INFO = {
  name: 'xump',
  title: 'XuMP player control',
  version: '0.1.0',
};

export const MCP_TOOLS = [
  {
    name: 'music_status',
    description:
      'What XuMP is playing right now: the current track with its NetEase song id, position, volume, repeat/shuffle, queue sizes and whether the track is liked.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: (params, call = request) => call('status', params),
  },
  {
    name: 'music_control',
    description:
      'Transport controls for the running player (pause/resume, skipping, volume, seek, repeat, shuffle). It controls the loaded track only; use music_play to start something specific.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'play',
            'pause',
            'play_pause',
            'stop',
            'next',
            'previous',
            'volume',
            'seek',
            'repeat',
            'shuffle',
          ],
        },
        value: {
          type: ['number', 'string'],
          description:
            'volume (0-100) for "volume", seconds for "seek", off|on|one for "repeat", on|off for "shuffle"',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    handler: ({ action, value }, call = request) => {
      const map = {
        play: { type: 'play' },
        pause: { type: 'pause' },
        play_pause: { type: 'playPause' },
        stop: { type: 'stop' },
        next: { type: 'next' },
        previous: { type: 'previous' },
      };
      if (action === 'volume') {
        const percent = Number(value);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          throw Object.assign(
            new Error('volume needs a number between 0 and 100'),
            {
              code: 'invalid_params',
            }
          );
        }
        return call('control', { type: 'setVolume', volume: percent / 100 });
      }
      if (action === 'seek') {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds < 0) {
          throw Object.assign(new Error('seek needs non-negative seconds'), {
            code: 'invalid_params',
          });
        }
        return call('control', { type: 'setPosition', position: seconds });
      }
      if (action === 'repeat') {
        if (!['off', 'on', 'one'].includes(value)) {
          throw Object.assign(new Error('repeat needs off | on | one'), {
            code: 'invalid_params',
          });
        }
        return call('control', { type: 'setLoopStatus', mode: value });
      }
      if (action === 'shuffle') {
        if (!['on', 'off'].includes(value)) {
          throw Object.assign(new Error('shuffle needs on | off'), {
            code: 'invalid_params',
          });
        }
        return call('control', {
          type: 'setShuffle',
          enabled: value === 'on',
        });
      }
      const command = map[action];
      if (!command) {
        throw Object.assign(new Error(`unsupported action "${action}"`), {
          code: 'invalid_params',
        });
      }
      return call('control', command);
    },
  },
  {
    name: 'music_search',
    description:
      'Search the NetEase catalog through the logged-in XuMP instance. Returns ids usable with music_play and music_like.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'keywords, e.g. "Beyond 海阔天空"',
        },
        type: {
          type: 'string',
          enum: ['song', 'album', 'artist', 'playlist'],
        },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['query'],
      additionalProperties: false,
    },
    handler: ({ query, type = 'song', offset = 0, limit = 10 }, call = request) =>
      call('search', { keywords: query, type, offset, limit }),
  },
  {
    name: 'music_play',
    description:
      'Start playing something: a song by id, a search query (best match), a playlist/album/artist by id. This replaces what is playing now; use music_queue when the user does not want the current song interrupted. Replies are "accepted", not proof that playback started - check music_status afterwards.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'NetEase song id' },
        query: {
          type: 'string',
          description: 'search text, best match is played',
        },
        playlist_id: { type: 'integer' },
        album_id: { type: 'integer' },
        artist_id: { type: 'integer' },
      },
      additionalProperties: false,
    },
    handler: async (params, call = request) => {
      const targets = [
        'id',
        'query',
        'playlist_id',
        'album_id',
        'artist_id',
      ].filter(key => params[key] !== undefined);
      if (targets.length !== 1) {
        throw Object.assign(
          new Error(
            'music_play accepts exactly one of id, query, playlist_id, album_id, artist_id'
          ),
          { code: 'invalid_params' }
        );
      }
      if (params.playlist_id)
        return call('play', { playlistId: params.playlist_id });
      if (params.album_id) return call('play', { albumId: params.album_id });
      if (params.artist_id)
        return call('play', { artistId: params.artist_id });
      if (params.id) return call('play', { id: params.id });
      const found = await call('search', {
        keywords: params.query,
        limit: 5,
      });
      const match = pickBestMatch(found.items, params.query);
      if (!match) {
        throw Object.assign(new Error(`no song found for "${params.query}"`), {
          code: 'no_match',
        });
      }
      const accepted = await call('play', { id: match.id });
      return { ...accepted, track: match };
    },
  },
  {
    name: 'music_queue',
    description:
      'Read the queue, or add tracks to the priority list that plays right after the current track. Prefer this over music_play when the current song should keep playing.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add'] },
        id: { type: 'integer', description: 'song id for action=add' },
        ids: {
          type: 'array',
          items: { type: 'integer' },
          description: 'song ids for action=add',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          description: 'page offset for action=list',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 256,
          description: 'page size for action=list',
        },
      },
      additionalProperties: false,
    },
    handler: ({ action = 'list', id, ids, offset = 0, limit = 100 }, call = request) => {
      if (action === 'list') return call('queue', { offset, limit });
      if (action === 'add') return call('enqueue', ids ? { ids } : { id });
      throw Object.assign(new Error(`unsupported action "${action}"`), {
        code: 'invalid_params',
      });
    },
  },
  {
    name: 'music_lyrics',
    description:
      'Timed lyrics for a song id (milliseconds), with the translation when the API has one. Paginated.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 256 },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: ({ id, offset = 0, limit = 100 }, call = request) =>
      call('lyrics', { id, offset, limit }),
  },
  {
    name: 'music_recommend',
    description:
      'The logged-in account\'s daily recommendation list. Good source for "play me something" requests; combine with music_play or music_queue.',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 256 },
      },
      additionalProperties: false,
    },
    handler: ({ offset = 0, limit = 20 } = {}, call = request) =>
      call('recommend', { offset, limit }),
  },
  {
    name: 'music_like',
    description:
      "Like or unlike a song in the user's NetEase account. Requires account writes to be enabled in the app; without that the call fails with account_write_disabled.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        liked: {
          type: 'boolean',
          description: 'true to like, false to unlike',
        },
      },
      required: ['id', 'liked'],
      additionalProperties: false,
    },
    handler: ({ id, liked }, call = request) => call('like', { id, liked }),
  },
];

const isPlainObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Minimal JSON-Schema check for tool arguments (types, enum, required,
// additionalProperties, numeric bounds).
export const validateToolArguments = (schema, args) => {
  const errors = [];
  const value = args === undefined || args === null ? {} : args;
  if (!isPlainObject(value)) return ['arguments must be an object'];
  const properties = schema.properties || {};
  for (const key of schema.required || []) {
    if (value[key] === undefined)
      errors.push(`missing required argument "${key}"`);
  }
  for (const [key, item] of Object.entries(value)) {
    const property = properties[key];
    if (!property) {
      if (schema.additionalProperties === false) {
        errors.push(`unknown argument "${key}"`);
      }
      continue;
    }
    const types = Array.isArray(property.type)
      ? property.type
      : [property.type];
    const matches = type =>
      (type === 'integer' && Number.isInteger(item)) ||
      (type === 'number' &&
        typeof item === 'number' &&
        Number.isFinite(item)) ||
      (type === 'string' && typeof item === 'string') ||
      (type === 'boolean' && typeof item === 'boolean') ||
      (type === 'array' && Array.isArray(item)) ||
      (type === 'object' && isPlainObject(item)) ||
      (type === 'null' && item === null);
    if (!types.some(matches)) {
      errors.push(`"${key}" must be ${types.join(' or ')}`);
      continue;
    }
    if (property.enum && !property.enum.includes(item)) {
      errors.push(`"${key}" must be one of ${property.enum.join(', ')}`);
    }
    if (typeof item === 'number') {
      if (property.minimum !== undefined && item < property.minimum) {
        errors.push(`"${key}" must be >= ${property.minimum}`);
      }
      if (property.maximum !== undefined && item > property.maximum) {
        errors.push(`"${key}" must be <= ${property.maximum}`);
      }
    }
  }
  return errors;
};

export const createMcpServer = ({
  socketPath,
  write = line => process.stdout.write(`${line}\n`),
  // In-process dispatch override: Electron's built-in MCP server injects a
  // `call` that talks to the renderer directly instead of the control socket.
  call = null,
} = {}) => {
  // an explicitly configured socket must win over discovery inside the session
  if (socketPath) process.env.XUMP_CONTROL_SOCKET = socketPath;
  let initialized = false;
  const invoke = call || ((method, params) => request(method, params));
  const send = message => write(JSON.stringify(message));
  const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) =>
    send({ jsonrpc: '2.0', id, error: { code, message } });

  const handle = async line => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      fail(null, -32700, 'invalid JSON');
      return;
    }
    if (!isPlainObject(message) || message.jsonrpc !== '2.0') {
      fail(
        isPlainObject(message) ? (message.id ?? null) : null,
        -32600,
        'invalid request'
      );
      return;
    }
    const { id, method, params } = message;
    const isNotification = id === undefined || id === null;
    if (typeof method !== 'string' || method === '') {
      if (!isNotification) fail(id, -32600, 'method must be a string');
      return;
    }
    // notifications never execute anything and never get a reply
    if (isNotification) {
      if (method === 'notifications/initialized') initialized = true;
      return;
    }
    if (!initialized && method !== 'initialize' && method !== 'ping') {
      fail(id, -32002, 'server is not initialized');
      return;
    }
    switch (method) {
      case 'initialize': {
        const requested = params?.protocolVersion;
        if (typeof requested !== 'string' || requested === '') {
          fail(id, -32602, 'initialize requires protocolVersion');
          return;
        }
        initialized = true;
        const negotiated = MCP_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : MCP_PROTOCOL_VERSIONS[0];
        reply(id, {
          protocolVersion: negotiated,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            'Controls the XuMP desktop music player through its local control socket. Check music_status before interrupting playback and prefer music_queue over music_play unless the user asked to play something now.',
        });
        return;
      }
      case 'ping':
        reply(id, {});
        return;
      case 'tools/list':
        reply(id, {
          tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        });
        return;
      case 'tools/call': {
        if (!isPlainObject(params) || typeof params.name !== 'string') {
          fail(id, -32602, 'tools/call requires a tool name');
          return;
        }
        const tool = MCP_TOOLS.find(
          candidate => candidate.name === params.name
        );
        if (!tool) {
          fail(id, -32602, `unknown tool "${params.name}"`);
          return;
        }
        const argumentErrors = validateToolArguments(
          tool.inputSchema,
          params.arguments
        );
        if (argumentErrors.length > 0) {
          fail(id, -32602, argumentErrors.join('; '));
          return;
        }
        try {
          const result = await tool.handler(params.arguments || {}, invoke);
          reply(id, {
            content: [
              {
                type: 'text',
                text:
                  typeof result === 'string'
                    ? result
                    : JSON.stringify(result ?? null, null, 2),
              },
            ],
            // structuredContent has to be an object in 2025-06-18
            ...(isPlainObject(result) ? { structuredContent: result } : {}),
          });
        } catch (error) {
          reply(id, {
            content: [
              {
                type: 'text',
                text: `error: ${error.code ? `${error.code}: ` : ''}${error.message}`,
              },
            ],
            isError: true,
          });
        }
        return;
      }
      default:
        fail(id, -32601, `unsupported method "${method}"`);
    }
  };

  const run = input =>
    new Promise((resolve, reject) => {
      let buffer = '';
      input.setEncoding('utf8');
      input.on('data', chunk => {
        buffer += chunk;
        let index = buffer.indexOf('\n');
        while (index !== -1) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (line) void handle(line);
          index = buffer.indexOf('\n');
        }
      });
      input.on('end', () => resolve());
      input.on('error', reject);
    });

  return { handle, run };
};

export const runCommand = async (argv, io = console) => {
  const { flags, positional } = parseArgs(argv);
  const json = flags.has('json');
  const socketPath = flags.get('socket');
  const call = (method, params) => request(method, params, { socketPath });
  const page = {};
  if (flags.has('limit')) page.limit = Number(flags.get('limit'));
  if (flags.has('offset')) page.offset = Number(flags.get('offset'));
  for (const key of ['limit', 'offset']) {
    if (page[key] !== undefined && !Number.isSafeInteger(page[key])) {
      throw Object.assign(new Error(`--${key} must be an integer`), {
        code: 'invalid_usage',
      });
    }
  }
  const emit = (value, printer) => {
    if (json) io.log(JSON.stringify(value, null, 2));
    else if (printer) printer(value, io);
    else io.log(typeof value === 'string' ? value : JSON.stringify(value));
  };
  const [command, ...rest] = positional;

  switch (command) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      io.log(HELP);
      return 0;
    case 'raw': {
      const payload = rest.join(' ').trim();
      if (!payload) {
        throw Object.assign(new Error('raw needs a JSON request'), {
          code: 'invalid_usage',
        });
      }
      let request_;
      try {
        request_ = JSON.parse(payload);
      } catch {
        throw Object.assign(new Error('raw needs valid JSON'), {
          code: 'invalid_usage',
        });
      }
      emit(await call(request_.method, request_.params));
      return 0;
    }
    case 'mcp': {
      const server = createMcpServer({ socketPath });
      await server.run(process.stdin);
      return 0;
    }
    case 'mcp-http': {
      const { startMcpHttpServer } = await import('./xump-mcp-http.mjs');
      const host = flags.get('host') || '127.0.0.1';
      const port = Number(flags.get('port') || 27233);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw Object.assign(
          new Error(`--port needs an integer between 0 and 65535`),
          { code: 'invalid_usage' }
        );
      }
      const handle = await startMcpHttpServer({ socketPath, host, port });
      io.log(`xump MCP (streamable http) listening on ${handle.url}`);
      // keep serving until killed
      await new Promise(() => {});
      return 0;
    }
    case 'status':
      emit(await call('status'), printStatus);
      return 0;
    case 'pause':
    case 'next':
    case 'stop':
      emit(await call('control', { type: command }));
      return 0;
    case 'prev':
    case 'previous':
      emit(await call('control', { type: 'previous' }));
      return 0;
    case 'toggle':
    case 'playpause':
      emit(await call('control', { type: 'playPause' }));
      return 0;
    case 'play': {
      if (flags.has('playlist')) {
        emit(await call('play', { playlistId: flags.get('playlist') }));
        return 0;
      }
      if (flags.has('album')) {
        emit(await call('play', { albumId: flags.get('album') }));
        return 0;
      }
      if (flags.has('artist')) {
        emit(await call('play', { artistId: flags.get('artist') }));
        return 0;
      }
      const target = rest.join(' ').trim();
      if (!target) {
        throw Object.assign(
          new Error(
            'play needs a query, a song id or --playlist/--album/--artist'
          ),
          {
            code: 'invalid_usage',
          }
        );
      }
      if (isId(target)) {
        emit(await call('play', { id: target }), () =>
          io.log(`▶ requested song ${target}`)
        );
        return 0;
      }
      const results = await call('search', { keywords: target, limit: 5 });
      const match = pickBestMatch(results.items, target);
      if (!match) {
        if (json)
          io.log(
            JSON.stringify(
              {
                error: {
                  code: 'no_match',
                  message: `no song found for "${target}"`,
                },
              },
              null,
              2
            )
          );
        else io.log(`no song found for "${target}"`);
        return json ? 1 : 0;
      }
      emit(await call('play', { id: match.id }), () =>
        io.log(`▶ ${describeTrack({ ...match, artists: match.artists })}`)
      );
      return 0;
    }
    case 'volume': {
      const percent = Number(rest[0]);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw Object.assign(
          new Error('volume needs a number between 0 and 100'),
          {
            code: 'invalid_usage',
          }
        );
      }
      emit(await call('control', { type: 'setVolume', volume: percent / 100 }));
      return 0;
    }
    case 'seek': {
      const seconds = Number(rest[0]);
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw Object.assign(
          new Error('seek needs a non-negative number of seconds'),
          {
            code: 'invalid_usage',
          }
        );
      }
      emit(await call('control', { type: 'setPosition', position: seconds }));
      return 0;
    }
    case 'repeat': {
      const mode = rest[0];
      if (!['off', 'on', 'one'].includes(mode)) {
        throw Object.assign(new Error('repeat needs off | on | one'), {
          code: 'invalid_usage',
        });
      }
      emit(await call('control', { type: 'setLoopStatus', mode }));
      return 0;
    }
    case 'shuffle': {
      const value = rest[0];
      if (!['on', 'off'].includes(value)) {
        throw Object.assign(new Error('shuffle needs on | off'), {
          code: 'invalid_usage',
        });
      }
      emit(
        await call('control', { type: 'setShuffle', enabled: value === 'on' })
      );
      return 0;
    }
    case 'queue': {
      const result = await call('queue', page);
      emit(result, value => {
        io.log(
          `queue ${value.playlist.total} + ${value.priority.total} up next, current index ${value.currentIndex}`
        );
        if (value.priority.total > 0) {
          printPage(value.priority, id => `next ${id}`, io);
        }
        printPage(value.playlist, id => `track ${id}`, io);
      });
      return 0;
    }
    case 'search': {
      const query = rest.join(' ').trim();
      if (!query) {
        throw Object.assign(new Error('search needs a query'), {
          code: 'invalid_usage',
        });
      }
      const result = await call('search', {
        keywords: query,
        type: flags.get('type') || 'song',
        ...page,
      });
      emit(result, value => printPage(value, item => trackLine(item), io));
      return 0;
    }
    case 'lyrics': {
      const id = rest[0];
      if (!isId(id)) {
        throw Object.assign(new Error('lyrics needs a song id'), {
          code: 'invalid_usage',
        });
      }
      const result = await call('lyrics', { id, ...page });
      emit(result, value => {
        printPage(
          value,
          line =>
            `${formatMs(line.timeMs).padStart(6)}  ${line.text}${
              line.translation ? `  /  ${line.translation}` : ''
            }`,
          io
        );
        if (!value.synced) io.log('(no timed lyrics for this track)');
      });
      return 0;
    }
    default:
      throw Object.assign(
        new Error(`unknown command "${command}" (try: xumpctl help)`),
        {
          code: 'invalid_usage',
        }
      );
  }
};

const main = async () => {
  const json = process.argv.includes('--json');
  try {
    process.exitCode = await runCommand(process.argv.slice(2));
  } catch (error) {
    const code = error.code || 'error';
    if (json) {
      console.log(
        JSON.stringify({ error: { code, message: error.message } }, null, 2)
      );
    } else {
      console.error(`xumpctl: ${code}: ${error.message}`);
    }
    process.exitCode = 1;
  }
};

// `__XUMP_BUNDLED__` is defined by electron-vite when this file is bundled
// into the desktop app's main process; the self-exec guard must not fire
// there (typeof keeps plain node / vitest runs working unchanged).
if (
  typeof __XUMP_BUNDLED__ === 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}

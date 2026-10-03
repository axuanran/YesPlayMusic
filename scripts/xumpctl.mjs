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

flags:
  --json              print the raw JSON result (also for errors)
  --socket <path>     talk to a specific control socket
  --limit/--offset    page sizes for queue/search/lyrics (max ${MAX_PAGE})

The socket lives at $XDG_RUNTIME_DIR/xump-control.sock unless XUMP_CONTROL_SOCKET
overrides it. CLI output is English; the app UI has its own translations.
`;

const BOOLEAN_FLAGS = new Set(['json', 'help', 'playlist-next']);
const VALUE_FLAGS = new Set([
  'socket',
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
  const existing = socketCandidates().filter(candidate => {
    try {
      return fs.statSync(candidate).isSocket();
    } catch {
      return false;
    }
  });
  if (existing.length === 0) {
    throw Object.assign(
      new Error(
        `XuMP control socket not found (looked in ${socketCandidates().join(
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

export const request = async (method, params = {}, options = {}) => {
  try {
    return await requestOnce(method, params, options.socketPath);
  } catch (error) {
    if (!RETRYABLE.has(method) || error.code !== 'timeout') throw error;
    return requestOnce(method, params, options.socketPath);
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main();
}

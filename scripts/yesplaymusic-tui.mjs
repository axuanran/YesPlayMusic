#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import readline from 'node:readline';

const RESOLVER_BASE =
  process.env.YPM_RESOLVER_URL || 'http://127.0.0.1:27232';
const SEARCH_LIMIT = 12;

const state = {
  mode: 'home',
  input: '',
  message: 'Type /keyword to search, l to login, Enter to play selected item.',
  cookie: process.env.YPM_TUI_COOKIE || loadStoredCookie(),
  loginMode: null,
  tracks: [],
  selected: 0,
  queue: [],
  nowPlaying: null,
  playerProcess: null,
};

const ansi = {
  clear: '\x1b[2J\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  inverse: '\x1b[7m',
  reset: '\x1b[0m',
  green: '\x1b[32m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function write(text) {
  process.stdout.write(text);
}

function formatArtists(track) {
  return (track?.artists || track?.ar || [])
    .map(artist => artist?.name)
    .filter(Boolean)
    .join(', ');
}

function formatTrack(track) {
  if (!track) return 'No track';
  const artists = formatArtists(track);
  return `${track.name || 'Unknown'}${artists ? ` - ${artists}` : ''} #${track.id}`;
}

function truncate(value, width) {
  const text = String(value || '');
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function render() {
  const columns = process.stdout.columns || 100;
  write(ansi.clear);
  write(`${ansi.green}YesPlayMusic Terminal TUI${ansi.reset}\n`);
  write(`${ansi.dim}Resolver: ${RESOLVER_BASE}${ansi.reset}\n\n`);

  write(
    `${ansi.cyan}Auth${ansi.reset} ${
      state.cookie ? 'cookie ready' : 'not logged in'
    }\n`
  );
  write(`${ansi.cyan}Now${ansi.reset} ${formatTrack(state.nowPlaying)}\n`);
  write(`${ansi.cyan}Queue${ansi.reset} ${state.queue.length} item(s)\n`);
  write(`${ansi.dim}${state.message}${ansi.reset}\n\n`);

  if (state.mode === 'search' || state.mode === 'cookieLogin') {
    const prompt = state.mode === 'cookieLogin' ? 'cookie> ' : '/';
    write(`${ansi.green}${prompt}${ansi.reset}${state.input}\n\n`);
  } else if (state.mode === 'login') {
    write(`${ansi.green}Login${ansi.reset}\n`);
    write('  1 Cookie login\n');
    write('  2 QR login\n');
    write('  Esc cancel\n\n');
  }

  const list = state.tracks.length ? state.tracks : state.queue;
  if (!list.length) {
    write('No items. Press / and search a song.\n');
  } else {
    list.slice(0, SEARCH_LIMIT).forEach((track, index) => {
      const prefix = index === state.selected ? `${ansi.inverse}>` : ' ';
      const suffix = index === state.selected ? ansi.reset : '';
      const line = `${String(index + 1).padStart(2, '0')} ${formatTrack(track)}`;
      write(`${prefix} ${truncate(line, columns - 4)}${suffix}\n`);
    });
  }

  write('\n');
  write(
    `${ansi.dim}Keys: / search | l login | f private roam | ↑↓ select | Enter play | a queue | n next | s stop | q quit${ansi.reset}\n`
  );
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function requestJsonWithHeaders(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return {
    data: await response.json(),
    headers: response.headers,
  };
}

function getAppDataDir() {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

function cookiePath() {
  return path.join(
    process.env.YPM_RESOLVER_STORAGE_DIR ||
      path.join(getAppDataDir(), 'YesPlayMusic', 'resolver-storage'),
    'cookie.json'
  );
}

function loadStoredCookie() {
  try {
    const data = JSON.parse(fs.readFileSync(cookiePath(), 'utf-8'));
    return data.cookie || '';
  } catch {
    return '';
  }
}

function saveStoredCookie(cookie) {
  const file = cookiePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ cookie, updatedAt: Date.now() }, null, 2),
    'utf-8'
  );
}

function normalizeCookieString(value) {
  const cookieAttributes = new Set([
    'domain',
    'expires',
    'httponly',
    'max-age',
    'path',
    'samesite',
    'secure',
  ]);
  return String(value || '')
    .split(value.includes(';;') ? ';;' : ';')
    .map(cookie => {
      const [rawKey, ...rawValue] = cookie.trim().split('=');
      const key = rawKey?.trim();
      const cookieValue = rawValue.join('=').trim();
      if (!key || !cookieValue || cookieAttributes.has(key.toLowerCase())) {
        return null;
      }
      return `${key}=${cookieValue}`;
    })
    .filter(Boolean)
    .join('; ');
}

function extractLoginCookie(headers, bodyCookie = '') {
  const headerCookie =
    headers
      .getSetCookie?.()
      ?.map(cookie => cookie.split(';')[0])
      .join('; ') ||
    headers
      .get('set-cookie')
      ?.split(/,(?=\s*[^;,=]+?=)/)
      .map(cookie => cookie.split(';')[0])
      .join('; ') ||
    '';
  return bodyCookie || headerCookie;
}

function setCookie(cookie) {
  const normalized = normalizeCookieString(cookie);
  if (!normalized.includes('MUSIC_U=')) {
    throw new Error('Cookie missing MUSIC_U.');
  }
  state.cookie = normalized;
  saveStoredCookie(normalized);
}

function neteaseHeaders() {
  return state.cookie
    ? {
        cookie: state.cookie,
      }
    : {};
}

async function syncCookieToResolver() {
  if (!state.cookie) return;
  try {
    await requestJson(`${RESOLVER_BASE}/api/admin/cookie`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cookie: state.cookie }),
    });
  } catch {
    // Resolver may be offline. Local cookie storage is still useful.
  }
}

async function searchTracks(keyword) {
  const url = new URL('https://music.163.com/api/search/get/web');
  url.searchParams.set('s', keyword);
  url.searchParams.set('type', '1');
  url.searchParams.set('limit', String(SEARCH_LIMIT));
  url.searchParams.set('offset', '0');
  const data = await requestJson(url, {
    headers: neteaseHeaders(),
  });
  return data.result?.songs || [];
}

async function loadPrivateRoamTracks() {
  state.message = 'Loading private roam...';
  render();
  const data = await requestJson('https://music.163.com/api/v1/radio/get', {
    headers: neteaseHeaders(),
  });
  const tracks = data.data || [];
  if (!tracks.length) {
    throw new Error(
      state.cookie
        ? 'No private roam tracks returned.'
        : 'No tracks returned. Login first or set YPM_TUI_COOKIE.'
    );
  }
  return tracks;
}

async function loginQrKey() {
  const data = await requestJson('https://music.163.com/api/login/qrcode/unikey', {
    method: 'POST',
    headers: {
      ...neteaseHeaders(),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ type: '3' }),
  });
  const key = data.unikey || data.data?.unikey;
  if (!key) throw new Error('Failed to create QR key.');
  return key;
}

async function loginQrCheck(key) {
  const result = await requestJsonWithHeaders(
    'https://music.163.com/api/login/qrcode/client/login',
    {
      method: 'POST',
      headers: {
        ...neteaseHeaders(),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ key, type: '3' }),
    }
  );
  return result;
}

async function startQrLogin() {
  try {
    const key = await loginQrKey();
    const qrUrl = `https://music.163.com/login?codekey=${key}`;
    state.message = `Open NetEase app and scan: ${qrUrl}`;
    render();

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const { data, headers } = await loginQrCheck(key);
      if (data.code === 800) throw new Error('QR expired.');
      if (data.code === 802) {
        state.message = 'QR scanned. Confirm login on your phone.';
        render();
      }
      if (data.code === 803) {
        setCookie(extractLoginCookie(headers, data.cookie));
        await syncCookieToResolver();
        state.message = 'QR login succeeded.';
        render();
        return;
      }
    }
    throw new Error('QR login timed out.');
  } catch (error) {
    state.message = `QR login failed: ${error.message}`;
    render();
  }
}

async function submitCookieLogin() {
  try {
    setCookie(state.input);
    state.input = '';
    state.mode = 'home';
    await syncCookieToResolver();
    state.message = 'Cookie login succeeded.';
  } catch (error) {
    state.message = `Cookie login failed: ${error.message}`;
  }
  render();
}

async function resolveTrack(track) {
  try {
    const data = await requestJson(`${RESOLVER_BASE}/api/audio/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        trackId: track.id,
        quality: 'standard',
        track,
      }),
    });
    if (data?.playUrl) {
      return data.playUrl.startsWith('/')
        ? `${RESOLVER_BASE}${data.playUrl}`
        : data.playUrl;
    }
  } catch (error) {
    state.message = `Resolver unavailable, using outer URL fallback: ${error.message}`;
  }
  return `https://music.163.com/song/media/outer/url?id=${track.id}`;
}

function commandParts(command) {
  if (process.platform === 'win32') {
    return ['cmd', ['/c', 'start', '""', command]];
  }
  if (process.platform === 'darwin') {
    return ['open', [command]];
  }
  return ['xdg-open', [command]];
}

function stopExternalPlayer() {
  if (!state.playerProcess) return;
  state.playerProcess.kill();
  state.playerProcess = null;
}

async function playTrack(track) {
  if (!track?.id) return;
  const url = await resolveTrack(track);
  stopExternalPlayer();

  const customPlayer = process.env.YPM_TUI_PLAYER;
  const [command, args] = customPlayer
    ? [customPlayer, [url]]
    : commandParts(url);

  state.playerProcess = spawn(command, args, {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true,
  });
  state.playerProcess.unref();
  state.nowPlaying = track;
  state.message = `Playing via ${customPlayer || command}: ${formatTrack(track)}`;
  render();
}

async function playSelected() {
  const list = state.tracks.length ? state.tracks : state.queue;
  const track = list[state.selected];
  await playTrack(track);
}

async function playNext() {
  if (!state.queue.length) {
    state.message = 'Queue is empty.';
    render();
    return;
  }
  const [track] = state.queue.splice(0, 1);
  await playTrack(track);
}

async function startPrivateRoam() {
  try {
    const tracks = await loadPrivateRoamTracks();
    const [first, ...rest] = tracks;
    state.tracks = tracks;
    state.queue.push(...rest);
    state.selected = 0;
    state.message = `Private roam loaded ${tracks.length} track(s).`;
    await playTrack(first);
  } catch (error) {
    state.message = `Private roam failed: ${error.message}`;
    render();
  }
}

async function submitSearch() {
  const keyword = state.input.trim();
  state.input = '';
  if (!keyword) return;
  state.message = `Searching: ${keyword}`;
  render();
  try {
    state.tracks = await searchTracks(keyword);
    state.selected = 0;
    state.message = `Found ${state.tracks.length} track(s).`;
  } catch (error) {
    state.message = `Search failed: ${error.message}`;
  }
  render();
}

function moveSelection(delta) {
  const list = state.tracks.length ? state.tracks : state.queue;
  if (!list.length) return;
  state.selected = (state.selected + delta + list.length) % list.length;
  render();
}

function queueSelected() {
  const track = state.tracks[state.selected];
  if (!track) return;
  state.queue.push(track);
  state.message = `Queued: ${formatTrack(track)}`;
  render();
}

function setupInput() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  write(ansi.hideCursor);
  render();

  process.stdin.on('keypress', async (char, key) => {
    if (key?.ctrl && key.name === 'c') return exit();
    if (state.mode === 'login') {
      if (key.name === '1') {
        state.mode = 'cookieLogin';
        state.input = '';
      } else if (key.name === '2') {
        state.mode = 'home';
        await startQrLogin();
        return;
      } else if (key.name === 'escape') {
        state.mode = 'home';
      }
      render();
      return;
    }
    if (state.mode === 'cookieLogin') {
      if (key.name === 'return') {
        await submitCookieLogin();
      } else if (key.name === 'escape') {
        state.mode = 'home';
        state.input = '';
        render();
      } else if (key.name === 'backspace') {
        state.input = state.input.slice(0, -1);
        render();
      } else if (char && !key.ctrl && !key.meta) {
        state.input += char;
        render();
      }
      return;
    }
    if (state.mode === 'search') {
      if (key.name === 'return') {
        state.mode = 'home';
        await submitSearch();
      } else if (key.name === 'escape') {
        state.mode = 'home';
        state.input = '';
        render();
      } else if (key.name === 'backspace') {
        state.input = state.input.slice(0, -1);
        render();
      } else if (char && !key.ctrl && !key.meta) {
        state.input += char;
        render();
      }
      return;
    }

    if (key.name === 'q') return exit();
    if (key.name === 'slash') {
      state.mode = 'search';
      state.input = '';
      render();
    } else if (key.name === 'l') {
      state.mode = 'login';
      render();
    } else if (key.name === 'up' || key.name === 'k') {
      moveSelection(-1);
    } else if (key.name === 'down' || key.name === 'j') {
      moveSelection(1);
    } else if (key.name === 'return') {
      await playSelected();
    } else if (key.name === 'f') {
      await startPrivateRoam();
    } else if (key.name === 'a') {
      queueSelected();
    } else if (key.name === 'n') {
      await playNext();
    } else if (key.name === 's') {
      stopExternalPlayer();
      state.message = 'Stopped external player process.';
      render();
    }
  });
}

function exit() {
  write(ansi.showCursor);
  write('\n');
  process.exit(0);
}

process.on('exit', () => write(ansi.showCursor));
syncCookieToResolver();
setupInput();

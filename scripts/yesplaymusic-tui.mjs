#!/usr/bin/env node
/* global AbortController, URL, clearInterval, clearTimeout, fetch, setInterval, setTimeout */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';
import readline from 'node:readline';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import QRCode from 'qrcode';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const ERROR_LOG_PATH = path.join(
  os.tmpdir(),
  'yesplaymusic-tui-last-error.log'
);
const RESOLVER_BASE = process.env.YPM_RESOLVER_URL || 'http://127.0.0.1:27232';
const SEARCH_LIMIT = 12;
const ROAM_REFILL_THRESHOLD = 2;
const PRE_RESOLVE_LIMIT = 4;
const RESOLVE_CACHE_TTL_MS = 4 * 60 * 1000;
const AUTO_START_RESOLVER = process.env.YPM_TUI_AUTO_RESOLVER !== '0';
const require = createRequire(import.meta.url);
const neteaseApi = require('@neteasecloudmusicapienhanced/api/main.js');

const state = {
  mode: 'home',
  input: '',
  message: 'Type /keyword to search, l to login, Enter to play selected item.',
  cookie: process.env.YPM_TUI_COOKIE || loadStoredCookie(),
  loginMode: null,
  qrTerminalText: '',
  qrLoginRunning: false,
  tracks: [],
  selected: 0,
  queue: [],
  nowPlaying: null,
  player: null,
  resolverProcess: null,
  playRequestId: 0,
  resolveCache: new Map(),
  resolveInflight: new Map(),
  lastError: '',
  roam: {
    active: false,
    loading: false,
    refillPromise: null,
    buffer: [],
    history: [],
    dislikedIds: new Set(),
  },
  playerStatus: {
    backend: 'detecting',
    paused: false,
    position: 0,
    duration: 0,
    volume: 100,
  },
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

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function truncate(value, width) {
  const text = String(value || '');
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 1))}…`;
}

function displayList() {
  if (state.roam.active) {
    return state.nowPlaying
      ? [state.nowPlaying, ...state.roam.buffer]
      : state.roam.buffer;
  }
  return state.tracks.length ? state.tracks : state.queue;
}

function selectedTrack() {
  return displayList()[state.selected];
}

function errorMessage(error) {
  if (!error) return 'Unknown error';
  const parts = [error.message || String(error)];
  if (error.code) parts.push(`code=${error.code}`);
  if (error.cause?.message) parts.push(`cause=${error.cause.message}`);
  if (error.cause?.code) parts.push(`causeCode=${error.cause.code}`);
  if (error.url) parts.push(`url=${error.url}`);
  return parts.join(' ');
}

function setLastError(scope, error) {
  state.lastError = `${scope}: ${errorMessage(error)}`;
  try {
    fs.writeFileSync(ERROR_LOG_PATH, `${state.lastError}\n`, 'utf-8');
  } catch {
    // Error logging is best-effort; the TUI still shows the short message.
  }
}

function isIgnorableResolverStderr(text) {
  return (
    text.includes('[MODULE_TYPELESS_PACKAGE_JSON]') ||
    text.includes('Reparsing as ES module because module syntax was detected')
  );
}

function isIgnorableMpvStatusError(error) {
  return ['ENOENT', 'ECONNREFUSED', 'ECONNRESET'].includes(error?.code);
}

function isExpiredStreamTokenDiagnosis(diagnosis) {
  return (
    diagnosis.includes('TOKEN_EXPIRED') ||
    diagnosis.includes('播放令牌已过期或无效')
  );
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
  write(
    `${ansi.cyan}Play${ansi.reset} ${state.playerStatus.backend}${
      state.playerStatus.paused ? ' paused' : ''
    } ${formatTime(state.playerStatus.position)}/${formatTime(
      state.playerStatus.duration
    )} vol ${Math.round(state.playerStatus.volume)}\n`
  );
  write(`${ansi.cyan}Queue${ansi.reset} ${state.queue.length} item(s)\n`);
  write(
    `${ansi.cyan}Roam${ansi.reset} ${
      state.roam.active ? 'on' : 'off'
    } buffer ${state.roam.buffer.length}${
      state.roam.loading ? ' loading' : ''
    }\n`
  );
  write(`${ansi.dim}${state.message}${ansi.reset}\n\n`);
  if (state.lastError) {
    write(
      `${ansi.red}Last error${ansi.reset} ${truncate(state.lastError, columns - 11)}\n\n`
    );
    write(`${ansi.dim}Full error: ${ERROR_LOG_PATH}${ansi.reset}\n\n`);
  }

  if (state.mode === 'search' || state.mode === 'cookieLogin') {
    const prompt = state.mode === 'cookieLogin' ? 'cookie> ' : '/';
    write(`${ansi.green}${prompt}${ansi.reset}${state.input}\n\n`);
  } else if (state.mode === 'login') {
    write(`${ansi.green}Login${ansi.reset}\n`);
    write('  1 Cookie login\n');
    write('  2 QR login in browser\n');
    write('  3 QR login in terminal\n');
    write('  4 Sync cookie to resolver\n');
    write('  Esc cancel\n\n');
  }

  if (state.qrTerminalText) {
    write(`${state.qrTerminalText}\n`);
  }

  const list = displayList();
  if (!list.length) {
    write('No items. Press / to search or f for private roam.\n');
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
    `${ansi.dim}Keys: / search | l login | f roam | r refresh roam | v like | h dislike | e clear error | ↑↓ select | Enter play | Space pause | ←→ seek | +/- volume | a queue | n next | s stop | q quit${ansi.reset}\n`
  );
}

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    error.url = url;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`${response.status} ${response.statusText}`);
    error.url = url;
    throw error;
  }
  return response.json();
}

async function isResolverHealthy() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(`${RESOLVER_BASE}/api/health`, {
        signal: controller.signal,
      });
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

async function waitForResolver(timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isResolverHealthy()) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function ensureResolver() {
  if (await isResolverHealthy()) {
    state.message = 'Resolver ready.';
    return;
  }
  if (!AUTO_START_RESOLVER) {
    state.message =
      'Resolver offline. Auto start disabled by YPM_TUI_AUTO_RESOLVER=0.';
    return;
  }
  state.message = 'Starting local resolver...';
  render();
  state.resolverProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  state.resolverProcess.stderr?.setEncoding('utf8');
  state.resolverProcess.stderr?.on('data', chunk => {
    const text = chunk.trim();
    if (!text || isIgnorableResolverStderr(text)) return;
    setLastError('resolver process', text);
    render();
  });
  state.resolverProcess.once('error', error => {
    setLastError('resolver start', error);
    state.message = `Resolver start failed: ${error.message}`;
    render();
  });
  state.resolverProcess.once('exit', code => {
    if (code !== 0) {
      setLastError('resolver exit', `resolver exited with code ${code}`);
      state.message = `Resolver exited with code ${code}`;
      render();
    }
    state.resolverProcess = null;
  });

  if (await waitForResolver()) {
    state.message = 'Resolver started.';
  } else {
    setLastError(
      'resolver start',
      `Timed out waiting for ${RESOLVER_BASE}/api/health`
    );
    state.message = 'Resolver did not become ready; fallback may be unstable.';
  }
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

function describeQrLoginData(data) {
  return `code=${data?.code ?? 'unknown'} message=${
    data?.message || data?.msg || ''
  }`;
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
  if (!state.cookie) {
    state.message = 'No cookie to sync. Login first.';
    return false;
  }
  try {
    await requestJson(`${RESOLVER_BASE}/api/admin/cookie`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cookie: state.cookie }),
    });
    state.message = 'Cookie synced to resolver.';
    return true;
  } catch (error) {
    setLastError('sync cookie', error);
    state.message = `Cookie sync failed: ${error.message}`;
    return false;
  }
}

async function syncCookieToResolverAndRender() {
  await syncCookieToResolver();
  render();
}

async function syncCookieToResolverQuietly() {
  if (!state.cookie) return false;
  try {
    await requestJson(`${RESOLVER_BASE}/api/admin/cookie`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cookie: state.cookie }),
    });
    return true;
  } catch {
    // Resolver may be offline. Local cookie storage is still useful.
    return false;
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
  state.roam.loading = true;
  state.message = 'Loading private roam...';
  render();
  try {
    const data = await requestJson('https://music.163.com/api/v1/radio/get', {
      headers: neteaseHeaders(),
    });
    const tracks = (data.data || []).filter(
      track => !state.roam.dislikedIds.has(track.id)
    );
    if (!tracks.length) {
      throw new Error(
        state.cookie
          ? 'No private roam tracks returned.'
          : 'No tracks returned. Login first or set YPM_TUI_COOKIE.'
      );
    }
    return tracks;
  } finally {
    state.roam.loading = false;
  }
}

async function loginQrKey() {
  const result = await neteaseApi.login_qr_key({
    timestamp: Date.now(),
  });
  const data = result.body || result;
  const key = data.data?.unikey || data.unikey;
  if (!key) throw new Error('Failed to create QR key.');
  return key;
}

async function loginQrCheck(key) {
  const result = await neteaseApi.login_qr_check({
    key,
    timestamp: Date.now(),
  });
  return {
    data: result.body || result,
    cookie: result.cookie || [],
  };
}

async function startQrLogin(display = 'browser') {
  let qrServer = null;
  try {
    const key = await loginQrKey();
    const qrUrl = `https://music.163.com/login?codekey=${key}`;
    state.qrTerminalText = '';
    if (display === 'terminal') {
      state.qrTerminalText = await QRCode.toString(qrUrl, {
        type: 'terminal',
        small: true,
      });
      state.message = 'Open NetEase app and scan the terminal QR code.';
    } else {
      qrServer = await createQrLoginServer(qrUrl);
      openUrl(qrServer.url);
      state.message = `Open local QR login page: ${qrServer.url}`;
    }
    render();

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const { data, cookie: responseCookie } = await loginQrCheck(key);
      if (data.code === 800) throw new Error('QR expired.');
      if (data.code === 802) {
        state.message = `QR scanned. Confirm login on your phone. ${describeQrLoginData(data)}`;
        render();
      }
      if (data.code === 803) {
        const cookie = data.cookie || responseCookie.join(';');
        if (!cookie) {
          throw new Error(
            `QR confirmed but no cookie returned. ${describeQrLoginData(data)}`
          );
        }
        setCookie(cookie.replaceAll(' HTTPOnly', ''));
        await syncCookieToResolverQuietly();
        state.qrTerminalText = '';
        state.message = `QR login succeeded. ${describeQrLoginData(data)}`;
        render();
        return;
      }
      if (![801, 802, 803].includes(data.code)) {
        state.message = `QR login waiting. ${describeQrLoginData(data)}`;
        render();
      }
    }
    throw new Error('QR login timed out.');
  } catch (error) {
    state.qrTerminalText = '';
    state.message = `QR login failed: ${error.message}`;
    render();
  } finally {
    state.qrLoginRunning = false;
    qrServer?.server.close();
  }
}

function beginQrLogin(display = 'browser') {
  if (state.qrLoginRunning) {
    state.message = 'QR login is already running.';
    render();
    return;
  }
  state.qrLoginRunning = true;
  void startQrLogin(display);
}

async function submitCookieLogin() {
  try {
    setCookie(state.input);
    state.input = '';
    state.mode = 'home';
    await syncCookieToResolverQuietly();
    state.message = 'Cookie login succeeded.';
  } catch (error) {
    state.message = `Cookie login failed: ${error.message}`;
  }
  render();
}

function getCachedResolvedUrl(track) {
  const cached = state.resolveCache.get(track?.id);
  if (!cached) return '';
  if (Date.now() > cached.expiresAt) {
    state.resolveCache.delete(track.id);
    return '';
  }
  return cached.url;
}

function setCachedResolvedUrl(track, url) {
  if (!track?.id || !url) return;
  state.resolveCache.set(track.id, {
    url,
    expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS,
  });
}

async function resolveTrackRaw(track) {
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
    setLastError('resolver', error);
    state.message =
      'Resolver unavailable, using NetEase outer URL fallback. Start desktop resolver or set YPM_RESOLVER_URL.';
  }
  return `https://music.163.com/song/media/outer/url?id=${track.id}`;
}

async function resolveTrack(track, { force = false } = {}) {
  if (!track?.id) throw new Error('Missing track id.');
  if (!force) {
    const cached = getCachedResolvedUrl(track);
    if (cached) return cached;
  }
  if (state.resolveInflight.has(track.id)) {
    return state.resolveInflight.get(track.id);
  }
  const promise = resolveTrackRaw(track)
    .then(url => {
      setCachedResolvedUrl(track, url);
      return url;
    })
    .finally(() => {
      state.resolveInflight.delete(track.id);
    });
  state.resolveInflight.set(track.id, promise);
  return promise;
}

function preResolveTracks(tracks, reason = 'queue') {
  const pending = tracks
    .filter(track => track?.id && !getCachedResolvedUrl(track))
    .slice(0, PRE_RESOLVE_LIMIT);
  if (!pending.length) return;
  void Promise.allSettled(
    pending.map(track =>
      resolveTrack(track).catch(error => {
        setLastError(`pre-resolve ${reason} ${formatTrack(track)}`, error);
      })
    )
  );
}

function preResolveUpcoming() {
  if (state.roam.active) {
    preResolveTracks(state.roam.buffer, 'roam');
    return;
  }
  preResolveTracks(state.queue, 'queue');
}

async function probePlayableUrl(url) {
  if (url.startsWith(`${RESOLVER_BASE}/api/audio/stream/`)) {
    return {
      contentType: 'audio/resolver-stream',
      finalUrl: url,
      status: 200,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        range: 'bytes=0-0',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) YesPlayMusic-TUI',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 206) {
      const error = new Error(
        `playable URL probe failed ${response.status} ${response.statusText}`
      );
      error.url = response.url || url;
      throw error;
    }
    await response.body?.cancel();
    return {
      contentType: response.headers.get('content-type') || '',
      finalUrl: response.url || url,
      status: response.status,
    };
  } catch (error) {
    error.url = url;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function diagnoseStreamUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      headers: {
        range: 'bytes=0-0',
        accept: '*/*',
      },
      redirect: 'manual',
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    let body = '';
    if (contentType.includes('json') || !response.ok) {
      body = (await response.text()).slice(0, 500);
    } else {
      await response.body?.cancel();
    }
    return `http=${response.status} ${response.statusText} type=${contentType} body=${body}`;
  } catch (error) {
    return errorMessage(error);
  } finally {
    clearTimeout(timer);
  }
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

function openUrl(url) {
  const [command, args] = commandParts(url);
  const opener = spawn(command, args, {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true,
  });
  opener.unref();
}

async function createQrLoginServer(qrUrl) {
  const svg = await QRCode.toString(qrUrl, {
    type: 'svg',
    margin: 2,
    width: 280,
  });
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YesPlayMusic TUI Login</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111827;color:#f9fafb;font-family:Arial,sans-serif}
main{padding:32px;border-radius:24px;background:#1f2937;box-shadow:0 24px 80px #0008;text-align:center}
.qr{padding:16px;border-radius:16px;background:white}
p{color:#d1d5db}
code{word-break:break-all;color:#93c5fd}
</style>
</head>
<body>
<main>
<h1>YesPlayMusic TUI Login</h1>
<div class="qr">${svg}</div>
<p>Open NetEase Cloud Music app and scan this QR code.</p>
<p><code>${qrUrl}</code></p>
</main>
</body>
</html>`;

  const server = http.createServer((request, response) => {
    if (request.url !== '/') {
      response.writeHead(302, { location: '/' });
      response.end();
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(html);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

function createIpcPath() {
  const name = `yesplaymusic-tui-${process.pid}`;
  if (process.platform === 'win32') return `\\\\.\\pipe\\${name}`;
  return path.join(os.tmpdir(), `${name}.sock`);
}

function forceKillProcess(processToKill) {
  if (!processToKill || processToKill.exitCode !== null) return;
  if (process.platform === 'win32' && processToKill.pid) {
    spawnSync('taskkill', ['/PID', String(processToKill.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  processToKill.kill('SIGKILL');
}

class ExternalPlayerBackend {
  constructor() {
    this.name = process.env.YPM_TUI_PLAYER || 'external';
    this.process = null;
  }

  async play(url) {
    await this.stop();
    const customPlayer = process.env.YPM_TUI_PLAYER;
    const [command, args] = customPlayer
      ? [customPlayer, [url]]
      : commandParts(url);
    this.name = customPlayer || command;
    this.process = spawn(command, args, {
      detached: process.platform !== 'win32',
      stdio: 'ignore',
      windowsHide: true,
    });
    this.process.once('error', error => {
      setLastError(`external player ${this.name}`, error);
      state.message = `External player failed: ${error.message}`;
      render();
    });
    this.process.unref();
    state.playerStatus.backend = this.name;
  }

  async stop() {
    if (!this.process) return;
    forceKillProcess(this.process);
    this.process = null;
  }

  async togglePause() {}

  async seek() {}

  async changeVolume() {}
}

class MpvPlayerBackend {
  constructor(onEnded) {
    this.name = 'mpv';
    this.process = null;
    this.ipcPath = createIpcPath();
    this.onEnded = onEnded;
    this.pollTimer = null;
    this.stopping = false;
    this.exited = true;
    this.stderr = '';
    this.currentUrl = '';
    this.currentTrack = null;
    this.retryingExpiredToken = false;
  }

  async play(url, track = null) {
    await this.stop();
    this.stopping = false;
    this.exited = false;
    this.currentUrl = url;
    this.currentTrack = track;
    this.ipcPath = createIpcPath();
    this.process = spawn(
      'mpv',
      [
        '--no-video',
        '--force-window=no',
        '--idle=no',
        '--msg-level=all=warn',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) YesPlayMusic-TUI',
        '--referrer=https://music.163.com/',
        `--input-ipc-server=${this.ipcPath}`,
        url,
      ],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
      }
    );
    this.process.stderr?.setEncoding('utf8');
    this.process.stderr?.on('data', chunk => {
      this.stderr = `${this.stderr}${chunk}`.slice(-1200);
    });
    state.playerStatus.backend = this.name;
    state.playerStatus.paused = false;
    state.playerStatus.position = 0;
    state.playerStatus.duration = 0;
    this.process.once('error', error => {
      this.exited = true;
      this.cleanup();
      setLastError('mpv spawn', error);
      state.message = `mpv failed: ${error.message}`;
      render();
    });
    this.process.once('exit', code => {
      this.exited = true;
      const shouldAdvance = !this.stopping && code === 0;
      this.cleanup();
      if (!this.stopping && code !== 0) {
        const stderr = this.stderr.trim();
        setLastError(
          'mpv exit',
          `mpv exited with code ${code} url=${this.currentUrl}${
            stderr ? ` stderr=${stderr}` : ''
          }`
        );
        state.message = `Playback failed: mpv exited with code ${code}`;
        render();
        void diagnoseStreamUrl(this.currentUrl).then(diagnosis => {
          setLastError(
            'mpv exit',
            `mpv exited with code ${code} url=${this.currentUrl}${
              stderr ? ` stderr=${stderr}` : ''
            } streamDiagnosis=${diagnosis}`
          );
          render();
          if (
            this.currentTrack &&
            !this.retryingExpiredToken &&
            isExpiredStreamTokenDiagnosis(diagnosis)
          ) {
            this.retryingExpiredToken = true;
            state.resolveCache.delete(this.currentTrack.id);
            state.message = 'Stream token expired. Re-resolving track...';
            render();
            void playTrack(this.currentTrack);
          }
        });
      }
      if (shouldAdvance) void this.onEnded();
    });
    this.pollTimer = setInterval(() => {
      void this.refreshStatus();
    }, 1000);
  }

  async stop() {
    this.stopping = true;
    const processToStop = this.process;
    if (processToStop) {
      try {
        await this.command(['quit']);
      } catch {
        // IPC may not be ready yet during rapid switching; kill below covers it.
      }
      await this.waitForExit(processToStop, 500);
      if (!this.exited) forceKillProcess(processToStop);
      await this.waitForExit(processToStop, 500);
    }
    this.cleanup();
  }

  waitForExit(processToWait, timeoutMs) {
    if (!processToWait || this.exited || processToWait.exitCode !== null) {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const timer = setTimeout(resolve, timeoutMs);
      processToWait.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  cleanup() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.process = null;
    if (process.platform !== 'win32') {
      try {
        fs.rmSync(this.ipcPath, { force: true });
      } catch {
        // Socket cleanup is best-effort; mpv may already have removed it.
      }
    }
  }

  command(command) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.ipcPath);
      let buffer = '';
      socket.setEncoding('utf8');
      socket.once('error', reject);
      socket.on('data', chunk => {
        buffer += chunk;
        const line = buffer.split('\n').find(Boolean);
        if (!line) return;
        socket.end();
        try {
          resolve(JSON.parse(line));
        } catch {
          resolve({});
        }
      });
      socket.once('connect', () => {
        socket.write(`${JSON.stringify({ command })}\n`);
      });
      socket.setTimeout(1000, () => {
        socket.destroy();
        reject(new Error('mpv IPC timeout'));
      });
    });
  }

  async getProperty(name) {
    const result = await this.command(['get_property', name]);
    return result?.data;
  }

  async setProperty(name, value) {
    await this.command(['set_property', name, value]);
  }

  async togglePause() {
    const paused = !(await this.getProperty('pause'));
    await this.setProperty('pause', paused);
    state.playerStatus.paused = paused;
    render();
  }

  async seek(seconds) {
    await this.command(['seek', seconds, 'relative']);
    await this.refreshStatus();
  }

  async changeVolume(delta) {
    const current = Number(await this.getProperty('volume')) || 100;
    const next = Math.min(130, Math.max(0, current + delta));
    await this.setProperty('volume', next);
    state.playerStatus.volume = next;
    render();
  }

  async refreshStatus() {
    try {
      const [position, duration, paused, volume] = await Promise.all([
        this.getProperty('time-pos'),
        this.getProperty('duration'),
        this.getProperty('pause'),
        this.getProperty('volume'),
      ]);
      state.playerStatus.position = Number(position) || 0;
      state.playerStatus.duration = Number(duration) || 0;
      state.playerStatus.paused = Boolean(paused);
      state.playerStatus.volume = Number(volume) || state.playerStatus.volume;
      render();
    } catch (error) {
      if (!isIgnorableMpvStatusError(error)) {
        setLastError('mpv status', error);
      }
    }
  }
}

function createPlayerBackend() {
  if (process.env.YPM_TUI_PLAYER) return new ExternalPlayerBackend();
  const mpvCheck = spawnSync('mpv', ['--version'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  if (mpvCheck.error) return new ExternalPlayerBackend();
  return new MpvPlayerBackend(playNext);
}

async function stopPlayer({ invalidate = false } = {}) {
  if (invalidate) state.playRequestId += 1;
  const player = state.player;
  state.player = null;
  state.nowPlaying = null;
  state.playerStatus.paused = false;
  state.playerStatus.position = 0;
  state.playerStatus.duration = 0;
  if (!player) return;
  await player.stop();
}

async function playTrack(track) {
  if (!track?.id) return;
  const requestId = (state.playRequestId += 1);
  state.lastError = '';
  await stopPlayer();
  state.message = `Switching to: ${formatTrack(track)}`;
  render();
  let url;
  try {
    url = await resolveTrack(track);
  } catch (error) {
    setLastError(`resolve ${formatTrack(track)}`, error);
    state.message = `Resolve failed: ${error.message}`;
    render();
    return;
  }
  if (requestId !== state.playRequestId) return;
  try {
    const probe = await probePlayableUrl(url);
    if (probe.contentType && !probe.contentType.includes('audio')) {
      state.message = `Playable URL content-type: ${probe.contentType}`;
    }
  } catch (error) {
    setLastError(`probe ${formatTrack(track)}`, error);
    state.message = `Playable URL probe failed: ${error.message}`;
    render();
    return;
  }
  if (requestId !== state.playRequestId) return;
  if (!state.player) state.player = createPlayerBackend();
  try {
    await state.player.play(url, track);
  } catch (error) {
    if (requestId !== state.playRequestId) return;
    setLastError(`play ${formatTrack(track)} url=${url}`, error);
    state.message = `mpv unavailable, fallback to external player: ${error.message}`;
    state.player = new ExternalPlayerBackend();
    try {
      await state.player.play(url, track);
    } catch (fallbackError) {
      setLastError(`fallback ${formatTrack(track)} url=${url}`, fallbackError);
      state.message = `Playback failed: ${fallbackError.message}`;
      render();
      return;
    }
  }
  if (requestId !== state.playRequestId) {
    await stopPlayer();
    return;
  }
  state.nowPlaying = track;
  state.message = `Playing via ${state.player.name}: ${formatTrack(track)}`;
  render();
  preResolveUpcoming();
}

async function playSelected() {
  const track = selectedTrack();
  if (state.roam.active && state.selected > 0) {
    state.roam.buffer = state.roam.buffer.filter(item => item.id !== track?.id);
    state.selected = 0;
  }
  await playTrack(track);
}

async function playNext() {
  if (state.roam.active) {
    await playNextRoamTrack();
    return;
  }
  if (!state.queue.length) {
    state.message = 'Queue is empty.';
    render();
    return;
  }
  const [track] = state.queue.splice(0, 1);
  await playTrack(track);
}

async function refillRoamBuffer({ force = false } = {}) {
  if (!state.cookie) {
    throw new Error('Private roam needs login. Press l to login.');
  }
  if (state.roam.loading) return state.roam.refillPromise;
  if (!force && state.roam.buffer.length > ROAM_REFILL_THRESHOLD) return;
  state.roam.refillPromise = loadPrivateRoamTracks()
    .then(tracks => {
      state.roam.buffer.push(...tracks);
      preResolveTracks(state.roam.buffer, 'roam');
      return tracks;
    })
    .finally(() => {
      state.roam.refillPromise = null;
    });
  return state.roam.refillPromise;
}

async function playNextRoamTrack() {
  try {
    if (!state.roam.buffer.length) {
      await refillRoamBuffer({ force: true });
    } else {
      await refillRoamBuffer();
    }
    const track = state.roam.buffer.shift();
    if (!track) {
      state.message = 'Private roam buffer is empty.';
      render();
      return;
    }
    state.roam.history.push(track);
    await playTrack(track);
    state.selected = 0;
    if (state.roam.buffer.length <= ROAM_REFILL_THRESHOLD) {
      void refillRoamBuffer().catch(error => {
        state.message = `Private roam refill failed: ${error.message}`;
        render();
      });
    }
  } catch (error) {
    state.message = `Private roam failed: ${error.message}`;
    render();
  }
}

async function refreshPrivateRoam() {
  try {
    state.roam.active = true;
    state.roam.buffer = [];
    state.selected = 0;
    await refillRoamBuffer({ force: true });
    state.message = `Private roam refreshed ${state.roam.buffer.length} track(s).`;
    render();
  } catch (error) {
    state.message = `Private roam failed: ${error.message}`;
    render();
  }
}

async function startPrivateRoam() {
  state.roam.active = true;
  state.tracks = [];
  await refreshPrivateRoam();
  await playNextRoamTrack();
}

async function submitSearch() {
  const keyword = state.input.trim();
  state.input = '';
  if (!keyword) return;
  state.roam.active = false;
  state.message = `Searching: ${keyword}`;
  render();
  try {
    state.tracks = await searchTracks(keyword);
    state.selected = 0;
    state.message = `Found ${state.tracks.length} track(s).`;
    preResolveTracks(state.tracks, 'search');
  } catch (error) {
    state.message = `Search failed: ${error.message}`;
  }
  render();
}

function moveSelection(delta) {
  const list = displayList();
  if (!list.length) return;
  state.selected = (state.selected + delta + list.length) % list.length;
  render();
}

function queueSelected() {
  const track = selectedTrack();
  if (!track) return;
  state.queue.push(track);
  state.message = `Queued: ${formatTrack(track)}`;
  preResolveUpcoming();
  render();
}

function likeCurrentTrack() {
  if (!state.nowPlaying) return;
  state.message = `Liked locally: ${formatTrack(state.nowPlaying)}`;
  render();
}

async function dislikeCurrentTrack() {
  if (!state.nowPlaying) return;
  state.roam.dislikedIds.add(state.nowPlaying.id);
  state.roam.buffer = state.roam.buffer.filter(
    track => track.id !== state.nowPlaying.id
  );
  state.message = `Disliked locally: ${formatTrack(state.nowPlaying)}`;
  if (state.roam.active) {
    await playNextRoamTrack();
  } else {
    render();
  }
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
        beginQrLogin('browser');
        return;
      } else if (key.name === '3') {
        state.mode = 'home';
        beginQrLogin('terminal');
        return;
      } else if (key.name === '4') {
        state.mode = 'home';
        await syncCookieToResolverAndRender();
        return;
      } else if (key.name === 'escape') {
        state.mode = 'home';
        state.qrTerminalText = '';
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
    } else if (key.name === 'space') {
      await state.player?.togglePause();
    } else if (key.name === 'right') {
      await state.player?.seek(5);
    } else if (key.name === 'left') {
      await state.player?.seek(-5);
    } else if (char === '+') {
      await state.player?.changeVolume(5);
    } else if (char === '-') {
      await state.player?.changeVolume(-5);
    } else if (key.name === 'f') {
      await startPrivateRoam();
    } else if (key.name === 'r') {
      await refreshPrivateRoam();
    } else if (key.name === 'v') {
      likeCurrentTrack();
    } else if (key.name === 'h') {
      await dislikeCurrentTrack();
    } else if (key.name === 'e') {
      state.lastError = '';
      render();
    } else if (key.name === 'a') {
      queueSelected();
    } else if (key.name === 'n') {
      await playNext();
    } else if (key.name === 's') {
      await stopPlayer({ invalidate: true });
      state.message = 'Stopped player.';
      render();
    }
  });
}

async function exit() {
  await stopPlayer({ invalidate: true });
  if (state.resolverProcess) {
    forceKillProcess(state.resolverProcess);
    state.resolverProcess = null;
  }
  write(ansi.showCursor);
  write('\n');
  process.exit(0);
}

async function main() {
  write(ansi.hideCursor);
  render();
  await ensureResolver();
  await syncCookieToResolverQuietly();
  setupInput();
}

process.on('exit', () => write(ansi.showCursor));
void main();

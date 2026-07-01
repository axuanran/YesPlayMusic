#!/usr/bin/env node
import { spawn } from 'node:child_process';
import process from 'node:process';
import readline from 'node:readline';

const RESOLVER_BASE =
  process.env.YPM_RESOLVER_URL || 'http://127.0.0.1:27232';
const SEARCH_LIMIT = 12;

const state = {
  mode: 'home',
  input: '',
  message: 'Type /keyword to search, Enter to play selected item.',
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

  write(`${ansi.cyan}Now${ansi.reset} ${formatTrack(state.nowPlaying)}\n`);
  write(`${ansi.cyan}Queue${ansi.reset} ${state.queue.length} item(s)\n`);
  write(`${ansi.dim}${state.message}${ansi.reset}\n\n`);

  if (state.input) {
    write(`${ansi.green}/${ansi.reset}${state.input}\n\n`);
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
  write(`${ansi.dim}Keys: / search | ↑↓ select | Enter play | a queue | n next | s stop | q quit${ansi.reset}\n`);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function searchTracks(keyword) {
  const url = new URL('https://music.163.com/api/search/get/web');
  url.searchParams.set('s', keyword);
  url.searchParams.set('type', '1');
  url.searchParams.set('limit', String(SEARCH_LIMIT));
  url.searchParams.set('offset', '0');
  const data = await requestJson(url);
  return data.result?.songs || [];
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
    } else if (key.name === 'up' || key.name === 'k') {
      moveSelection(-1);
    } else if (key.name === 'down' || key.name === 'j') {
      moveSelection(1);
    } else if (key.name === 'return') {
      await playSelected();
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
setupInput();

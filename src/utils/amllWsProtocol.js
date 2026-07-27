export const DEFAULT_AMLL_WS_URL = 'ws://127.0.0.1:11444';

const MAX_MESSAGE_SIZE = 1024 * 1024;
const RECONNECT_DELAY = 3000;
const STATE_REPLAY_ORDER = [
  'setMusic',
  'setCover',
  'setLyric',
  'progress',
  'volume',
  'playback',
  'modeChanged',
];
const COMMANDS = new Set([
  'pause',
  'resume',
  'forwardSong',
  'backwardSong',
  'setVolume',
  'seekPlayProgress',
  'setRepeatMode',
  'setShuffleMode',
]);

function isOpen(socket, WebSocketClass) {
  return socket?.readyState === (WebSocketClass?.OPEN ?? 1);
}

function normalizeCommand(value) {
  if (!value || typeof value !== 'object' || !COMMANDS.has(value.command)) {
    return null;
  }

  switch (value.command) {
    case 'setVolume': {
      const volume = Number(value.volume);
      return Number.isFinite(volume)
        ? { command: value.command, volume: Math.min(1, Math.max(0, volume)) }
        : null;
    }
    case 'seekPlayProgress': {
      const progress = Number(value.progress);
      return Number.isFinite(progress) && progress >= 0
        ? { command: value.command, progress }
        : null;
    }
    case 'setRepeatMode':
      return ['off', 'all', 'one'].includes(value.mode)
        ? { command: value.command, mode: value.mode }
        : null;
    case 'setShuffleMode':
      return typeof value.enabled === 'boolean'
        ? { command: value.command, enabled: value.enabled }
        : null;
    default:
      return { command: value.command };
  }
}

export class AmllWsProtocolClient {
  constructor({
    WebSocketClass = globalThis.WebSocket,
    url = DEFAULT_AMLL_WS_URL,
    reconnectDelay = RECONNECT_DELAY,
  } = {}) {
    this.WebSocketClass = WebSocketClass;
    this.url = url;
    this.reconnectDelay = reconnectDelay;
    this.enabled = false;
    this.socket = null;
    this.commandHandler = null;
    this.reconnectTimer = null;
    this.states = new Map();
  }

  enable(commandHandler) {
    this.commandHandler =
      typeof commandHandler === 'function' ? commandHandler : null;
    if (this.enabled) return;
    this.enabled = true;
    this.connect();
  }

  disable() {
    this.enabled = false;
    this.commandHandler = null;
    this.states.clear();
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < 2) socket.close();
  }

  connect() {
    if (
      !this.enabled ||
      !this.WebSocketClass ||
      (this.socket && this.socket.readyState < 2)
    ) {
      return;
    }

    let socket;
    try {
      socket = new this.WebSocketClass(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket = socket;
    socket.addEventListener('open', () => {
      if (socket !== this.socket || !this.enabled) return;
      this.send({ type: 'initialize' });
      this.replayState();
    });
    socket.addEventListener('message', event => {
      if (socket !== this.socket || !this.enabled) return;
      this.handleMessage(event.data);
    });
    socket.addEventListener('close', () => {
      if (socket !== this.socket) return;
      this.socket = null;
      this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      // AMLL Player may not be running. The close event handles reconnection.
    });
  }

  scheduleReconnect() {
    if (!this.enabled || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
  }

  send(payload) {
    if (!isOpen(this.socket, this.WebSocketClass)) return false;
    try {
      this.socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  publish(update) {
    if (!update?.update) return false;
    const stateKey =
      update.update === 'paused' || update.update === 'resumed'
        ? 'playback'
        : update.update;
    this.states.set(stateKey, update);
    return this.send({ type: 'state', value: update });
  }

  replayState() {
    STATE_REPLAY_ORDER.forEach(key => {
      const update = this.states.get(key);
      if (update) this.send({ type: 'state', value: update });
    });
  }

  handleMessage(rawData) {
    if (typeof rawData !== 'string' || rawData.length > MAX_MESSAGE_SIZE)
      return;

    let payload;
    try {
      payload = JSON.parse(rawData);
    } catch {
      return;
    }

    if (payload?.type === 'ping') {
      this.send({ type: 'pong' });
      return;
    }
    if (payload?.type !== 'command') return;

    const command = normalizeCommand(payload.value);
    if (command) this.commandHandler?.(command);
  }
}

export const amllWsProtocol = new AmllWsProtocolClient();

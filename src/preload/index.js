import { contextBridge, ipcRenderer } from 'electron';

const MAX_STRING_LENGTH = 131072;
const MAX_ARRAY_LENGTH = 256;
const MAX_OBJECT_KEYS = 128;
const MAX_DEPTH = 8;

const on = (channel, callback) => {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const isObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isBoundedString = (value, minLength = 0, maxLength = MAX_STRING_LENGTH) =>
  typeof value === 'string' &&
  value.length >= minLength &&
  value.length <= maxLength;

const isFiniteNumberInRange = (
  value,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const isPlainObject = value => {
  if (!isObject(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const sanitizeSerializableValue = (value, depth = 0, seen = new WeakSet()) => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    isFiniteNumberInRange(value) ||
    isBoundedString(value)
  ) {
    return value;
  }

  if (depth >= MAX_DEPTH) return undefined;

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH || seen.has(value)) return undefined;
    seen.add(value);

    const nextValue = [];
    for (const item of value) {
      const sanitizedItem = sanitizeSerializableValue(item, depth + 1, seen);
      if (sanitizedItem === undefined) return undefined;
      nextValue.push(sanitizedItem);
    }

    return nextValue;
  }

  if (!isPlainObject(value) || seen.has(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > MAX_OBJECT_KEYS) return undefined;
  seen.add(value);

  const nextValue = {};
  for (const [key, item] of entries) {
    if (!isBoundedString(key, 1, 256)) return undefined;
    const sanitizedItem = sanitizeSerializableValue(item, depth + 1, seen);
    if (sanitizedItem !== undefined) {
      nextValue[key] = sanitizedItem;
    }
  }

  return nextValue;
};

const sendObject = (channel, value) => {
  const sanitizedValue = sanitizeSerializableValue(value);
  if (sanitizedValue !== undefined && isPlainObject(sanitizedValue)) {
    ipcRenderer.send(channel, sanitizedValue);
  }
};

const sendString = (channel, value, options = {}) => {
  const {
    minLength = 0,
    maxLength = MAX_STRING_LENGTH,
    allowedValues = null,
  } = options;

  if (!isBoundedString(value, minLength, maxLength)) return;
  if (allowedValues !== null && !allowedValues.includes(value)) return;

  ipcRenderer.send(channel, value);
};

const sendNumber = (channel, value, options = {}) => {
  const { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } =
    options;

  if (!isFiniteNumberInRange(value, min, max)) return;

  ipcRenderer.send(channel, value);
};

const sendBoolean = (channel, value) => {
  if (typeof value === 'boolean') ipcRenderer.send(channel, value);
};

contextBridge.exposeInMainWorld('electronAPI', {
  window: {
    minimize: () => ipcRenderer.send('minimize'),
    maximizeOrUnmaximize: () => ipcRenderer.send('maximizeOrUnmaximize'),
    close: () => ipcRenderer.send('close'),
    onIsMaximized: callback => on('isMaximized', callback),
  },
  settings: {
    updateTrayIcon: () => ipcRenderer.send('updateTrayIcon'),
    removeProxy: () => ipcRenderer.send('removeProxy'),
    setProxy: config => sendObject('setProxy', config),
    updateSettings: options => sendObject('settings', options),
    switchGlobalShortcutStatusTemporary: status =>
      sendString('switchGlobalShortcutStatusTemporary', status, {
        allowedValues: ['enable', 'disable'],
      }),
    updateShortcut: payload => sendObject('updateShortcut', payload),
    restoreDefaultShortcuts: () => ipcRenderer.send('restoreDefaultShortcuts'),
  },
  player: {
    updateTrayTooltip: title =>
      sendString('updateTrayTooltip', title, { maxLength: 256 }),
    updateTrayLikeState: isLiked => sendBoolean('updateTrayLikeState', isLiked),
    updateTrayPlayState: isPlaying =>
      sendBoolean('updateTrayPlayState', isPlaying),
    playerCurrentTrackTime: progress =>
      sendNumber('playerCurrentTrackTime', progress, { min: 0 }),
    seeked: position => sendNumber('seeked', position, { min: 0 }),
    metadata: metadata => sendObject('metadata', metadata),
    sendLyrics: payload => sendObject('sendLyrics', payload),
    playDiscordPresence: track => sendObject('playDiscordPresence', track),
    pauseDiscordPresence: track => sendObject('pauseDiscordPresence', track),
    player: payload => sendObject('player', payload),
    switchRepeatMode: mode =>
      sendString('switchRepeatMode', mode, {
        allowedValues: ['off', 'on', 'one'],
      }),
    switchShuffle: shuffle => sendBoolean('switchShuffle', shuffle),
    onSaveLyricFinished: callback => on('saveLyricFinished', callback),
  },
  appEvents: {
    onChangeRouteTo: callback => on('changeRouteTo', callback),
    onSearch: callback => on('search', callback),
    onPlay: callback => on('play', callback),
    onNext: callback => on('next', callback),
    onPrevious: callback => on('previous', callback),
    onIncreaseVolume: callback => on('increaseVolume', callback),
    onDecreaseVolume: callback => on('decreaseVolume', callback),
    onLike: callback => on('like', callback),
    onRepeat: callback => on('repeat', callback),
    onShuffle: callback => on('shuffle', callback),
    onRouterGo: callback => on('routerGo', callback),
    onNextUp: callback => on('nextUp', callback),
    onRememberCloseAppOption: callback =>
      on('rememberCloseAppOption', callback),
    onSetPosition: callback => on('setPosition', callback),
  },
  app: {
    showNativeAlert: message =>
      sendString('showNativeAlert', message, { minLength: 1, maxLength: 1024 }),
    openExternalUrl: url => ipcRenderer.invoke('open-external-url', url),
    openNeteaseWebLogin: () => ipcRenderer.invoke('open-netease-web-login'),
    openResolverAdminPanel: url =>
      ipcRenderer.invoke('open-resolver-admin-panel', url),
  },
});

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

const normalizeSourceList = source => {
  if (!isBoundedString(source, 1, 256)) return null;

  const normalizedSource = source.trim();
  if (
    normalizedSource.length === 0 ||
    /[^a-z0-9_,\-\s]/i.test(normalizedSource)
  ) {
    return null;
  }

  return normalizedSource;
};

const normalizeUnblockMusicConfig = config => {
  if (!isPlainObject(config) || Object.keys(config).length > 3) return null;

  const nextConfig = {};
  for (const key of ['joox:cookie', 'qq:cookie', 'ytdl:exe']) {
    if (!(key in config)) continue;

    const value = config[key];
    if (value !== null && !isBoundedString(value, 0, 4096)) return null;
    nextConfig[key] = value;
  }

  return nextConfig;
};

const normalizeUnblockMusicContext = context => {
  if (!isPlainObject(context) || Object.keys(context).length > 4) return null;

  const nextContext = {};

  if ('enableFlac' in context) {
    if (
      context.enableFlac !== null &&
      typeof context.enableFlac !== 'boolean'
    ) {
      return null;
    }
    nextContext.enableFlac = context.enableFlac;
  }

  if ('proxyUri' in context) {
    if (
      context.proxyUri !== null &&
      !isBoundedString(context.proxyUri, 1, 2048)
    ) {
      return null;
    }
    nextContext.proxyUri = context.proxyUri;
  }

  if ('searchMode' in context) {
    if (!isFiniteNumberInRange(context.searchMode, 0, 1)) return null;
    nextContext.searchMode = context.searchMode;
  }

  if ('config' in context) {
    const config = normalizeUnblockMusicConfig(context.config);
    if (config === null) return null;
    nextContext.config = config;
  }

  return nextContext;
};

const normalizeUnblockMusicTrackArtist = artist => {
  if (!isPlainObject(artist) || !isBoundedString(artist.name, 1, 256)) {
    return null;
  }

  const nextArtist = {
    name: artist.name,
  };

  if ('id' in artist) {
    if (
      artist.id !== null &&
      !(
        isFiniteNumberInRange(artist.id, 0) || isBoundedString(artist.id, 1, 64)
      )
    ) {
      return null;
    }
    nextArtist.id = artist.id;
  }

  return nextArtist;
};

const normalizeUnblockMusicTrackAlbum = album => {
  if (!isPlainObject(album) || !isBoundedString(album.name, 1, 256)) {
    return null;
  }

  const nextAlbum = {
    name: album.name,
  };

  if ('id' in album) {
    if (
      album.id !== null &&
      !(isFiniteNumberInRange(album.id, 0) || isBoundedString(album.id, 1, 64))
    ) {
      return null;
    }
    nextAlbum.id = album.id;
  }

  return nextAlbum;
};

const normalizeUnblockMusicTrack = track => {
  if (
    !isPlainObject(track) ||
    !(isFiniteNumberInRange(track.id, 0) || isBoundedString(track.id, 1, 64)) ||
    !isBoundedString(track.name, 1, 256) ||
    !isFiniteNumberInRange(track.dt, 0) ||
    !Array.isArray(track.ar) ||
    track.ar.length === 0 ||
    track.ar.length > 32 ||
    !isPlainObject(track.al)
  ) {
    return null;
  }

  const nextArtists = [];
  for (const artist of track.ar) {
    const normalizedArtist = normalizeUnblockMusicTrackArtist(artist);
    if (normalizedArtist === null) return null;
    nextArtists.push(normalizedArtist);
  }

  const album = normalizeUnblockMusicTrackAlbum(track.al);
  if (album === null) return null;

  return {
    id: track.id,
    name: track.name,
    dt: track.dt,
    ar: nextArtists,
    al: album,
  };
};

const invokeUnblockMusic = (source, track, options = {}) => {
  const normalizedSource = normalizeSourceList(source);
  const normalizedTrack = normalizeUnblockMusicTrack(track);
  const normalizedContext = normalizeUnblockMusicContext(options);

  if (
    normalizedSource === null ||
    normalizedTrack === null ||
    normalizedContext === null
  ) {
    return Promise.reject(new TypeError('Invalid unblock music payload'));
  }

  return ipcRenderer.invoke(
    'unblock-music',
    normalizedSource,
    normalizedTrack,
    normalizedContext
  );
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
    unblockMusic: invokeUnblockMusic,
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
    openResolverAdminPanel: url => ipcRenderer.invoke('open-resolver-admin-panel', url),
  },
});

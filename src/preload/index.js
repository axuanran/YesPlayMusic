import { contextBridge, ipcRenderer } from 'electron';

const on = (channel, callback) => {
  const listener = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

const isObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const sendObject = (channel, value) => {
  if (isObject(value)) ipcRenderer.send(channel, value);
};

const sendString = (channel, value) => {
  if (typeof value === 'string') ipcRenderer.send(channel, value);
};

const sendNumber = (channel, value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    ipcRenderer.send(channel, value);
  }
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
      sendString('switchGlobalShortcutStatusTemporary', status),
    updateShortcut: payload => sendObject('updateShortcut', payload),
    restoreDefaultShortcuts: () => ipcRenderer.send('restoreDefaultShortcuts'),
  },
  player: {
    updateTrayTooltip: title => sendString('updateTrayTooltip', title),
    updateTrayLikeState: isLiked => sendBoolean('updateTrayLikeState', isLiked),
    updateTrayPlayState: isPlaying =>
      sendBoolean('updateTrayPlayState', isPlaying),
    playerCurrentTrackTime: progress =>
      sendNumber('playerCurrentTrackTime', progress),
    seeked: position => sendNumber('seeked', position),
    metadata: metadata => sendObject('metadata', metadata),
    sendLyrics: payload => sendObject('sendLyrics', payload),
    playDiscordPresence: track => sendObject('playDiscordPresence', track),
    pauseDiscordPresence: track => sendObject('pauseDiscordPresence', track),
    player: payload => sendObject('player', payload),
    switchRepeatMode: mode => sendString('switchRepeatMode', mode),
    switchShuffle: shuffle => sendBoolean('switchShuffle', shuffle),
    unblockMusic: (source, track, options) =>
      ipcRenderer.invoke(
        'unblock-music',
        typeof source === 'string' ? source : null,
        isObject(track) ? track : null,
        isObject(options) ? options : {}
      ),
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
    showNativeAlert: message => sendString('showNativeAlert', message),
  },
});

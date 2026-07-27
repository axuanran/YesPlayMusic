import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  shell,
  session,
} from 'electron';
import { registerGlobalShortcuts } from '@/electron/globalShortcut';
import cloneDeep from 'lodash/cloneDeep';
import shortcuts, { normalizeShortcuts } from '@/utils/shortcuts';
import { createMenu } from './menu';
import { isCreateTray, isMac } from '@/utils/platform';
import { updateWindowShadow } from './windowAppearance.js';
import {
  canPublishDiscordPresence,
  getDiscordStatus,
  getDiscordProgressTimestamps,
} from './discordPresence.js';
import { clearSessionDiskCache } from './cache.js';
import { saveTrackDownload } from './trackDownload.js';

const clc = require('cli-color');
const log = text => {
  console.log(`${clc.blueBright('[ipcMain.js]')} ${text}`);
};

let resolverAdminWindow = null;

const exitAsk = (e, win) => {
  e.preventDefault(); //阻止默认行为
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Information',
      cancelId: 2,
      defaultId: 0,
      message: '确定要关闭吗？',
      buttons: ['最小化', '直接退出'],
    })
    .then(result => {
      if (result.response == 0) {
        e.preventDefault(); //阻止默认行为
        win.minimize(); //调用 最小化实例方法
      } else if (result.response == 1) {
        win = null;
        //app.quit();
        app.exit(); //exit()直接关闭客户端，不会执行quit();
      }
    })
    .catch(err => {
      log(err);
    });
};

const exitAskWithoutMac = (e, win) => {
  e.preventDefault(); //阻止默认行为
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Information',
      cancelId: 2,
      defaultId: 0,
      message: '确定要关闭吗？',
      buttons: ['最小化到托盘', '直接退出'],
      checkboxLabel: '记住我的选择',
    })
    .then(result => {
      if (result.checkboxChecked && result.response !== 2) {
        win.webContents.send(
          'rememberCloseAppOption',
          result.response === 0 ? 'minimizeToTray' : 'exit'
        );
      }

      if (result.response === 0) {
        e.preventDefault(); //阻止默认行为
        win.hide(); //调用 最小化实例方法
      } else if (result.response === 1) {
        win = null;
        //app.quit();
        app.exit(); //exit()直接关闭客户端，不会执行quit();
      }
    })
    .catch(err => {
      log(err);
    });
};

const client = require('discord-rich-presence')('818936529484906596');

const DISCORD_STATUS_CHANNEL = 'discord:status';
let discordConnected = false;
let discordPresenceEnabled = false;
let discordStatusWindow = null;
let pendingDiscordPresence = null;

const publishDiscordStatus = () => {
  if (
    !discordStatusWindow ||
    discordStatusWindow.isDestroyed?.() ||
    discordStatusWindow.webContents?.isDestroyed?.()
  ) {
    return;
  }
  discordStatusWindow.webContents.send(
    DISCORD_STATUS_CHANNEL,
    getDiscordStatus(discordConnected, discordPresenceEnabled)
  );
};

client.on('connected', () => {
  discordConnected = true;
  publishDiscordStatus();
  if (pendingDiscordPresence) {
    updateDiscordPresence(pendingDiscordPresence);
  }
});

client.on('error', err => {
  discordConnected = false;
  publishDiscordStatus();
  const errorMessage = err instanceof Error ? err.message : `${err}`;
  log(`discord rich presence unavailable: ${errorMessage}`);
});

const updateDiscordPresence = presence => {
  if (
    !canPublishDiscordPresence(discordConnected, discordPresenceEnabled) ||
    !presence
  ) {
    return false;
  }
  try {
    client.updatePresence(presence);
    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : `${err}`;
    log(`discord rich presence unavailable: ${errorMessage}`);
    return false;
  }
};

const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = value => typeof value === 'string' && value.length > 0;

const isFiniteNumberInRange = (
  value,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const isValidProxyConfig = config =>
  isRecord(config) &&
  ['http', 'https', 'socks4', 'socks5'].includes(config.protocol) &&
  isNonEmptyString(config.server) &&
  (typeof config.port === 'number' || isNonEmptyString(config.port));

const getNeteaseCookieString = async loginSession => {
  const cookies = await loginSession.cookies.get({
    domain: 'music.163.com',
  });

  return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
};

export function initIpcMain(
  win,
  store,
  trayEventEmitter,
  desktopLyrics,
  localMusicService,
  streamingService
) {
  discordStatusWindow = win;
  discordPresenceEnabled =
    store.get('settings.enableDiscordRichPresence') === true;
  win.webContents.on('did-finish-load', publishDiscordStatus);
  ipcMain.handle('discord:get-status', () =>
    getDiscordStatus(discordConnected, discordPresenceEnabled)
  );
  ipcMain.handle('cache:clear-disk', () =>
    clearSessionDiskCache(win.webContents.session, win.webContents.getURL())
  );
  ipcMain.handle('download:track', (event, payload) => {
    if (event.sender !== win.webContents) {
      throw new Error('Invalid download sender');
    }
    return saveTrackDownload({
      win,
      dialog,
      net,
      payload,
      onProgress: progress => {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send('download:progress', progress);
        }
      },
    });
  });

  ipcMain.handle('local-music:list', () => localMusicService?.list() || []);
  localMusicService?.onChange(change => {
    if (!win.isDestroyed()) {
      win.webContents.send('local-music:changed', change);
    }
  });
  ipcMain.handle('local-music:get', (_, id) => {
    if (typeof id !== 'string' || id.length > 128 || !id.startsWith('local:')) {
      return null;
    }
    return localMusicService?.get(id) || null;
  });
  ipcMain.handle('local-music:select', async () => {
    if (!localMusicService) return { tracks: [], imported: 0, skipped: 0 };
    const result = await dialog.showOpenDialog(win, {
      title: '选择本地音乐',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Audio',
          extensions: [
            'mp3',
            'flac',
            'm4a',
            'aac',
            'ogg',
            'oga',
            'opus',
            'wav',
          ],
        },
      ],
    });
    if (result.canceled) {
      return {
        tracks: localMusicService.list(),
        imported: 0,
        skipped: 0,
      };
    }
    return localMusicService.importFiles(result.filePaths);
  });
  ipcMain.handle('local-music:remove', (_, ids) => {
    if (
      !Array.isArray(ids) ||
      ids.length > 256 ||
      ids.some(
        id =>
          typeof id !== 'string' || id.length > 128 || !id.startsWith('local:')
      )
    ) {
      return localMusicService?.list() || [];
    }
    return localMusicService?.remove(ids) || [];
  });
  ipcMain.handle('local-music:list-folders', () => {
    return localMusicService?.listFolders() || [];
  });
  ipcMain.handle('local-music:select-folders', async () => {
    if (!localMusicService) return { folders: [], added: 0, skipped: 0 };
    const result = await dialog.showOpenDialog(win, {
      title: '选择本地音乐文件夹',
      properties: ['openDirectory', 'multiSelections'],
    });
    if (result.canceled) {
      return {
        folders: localMusicService.listFolders(),
        added: 0,
        skipped: 0,
      };
    }
    return localMusicService.addFolders(result.filePaths);
  });
  ipcMain.handle('local-music:open-folder', (_, folderId) => {
    if (
      typeof folderId !== 'string' ||
      folderId.length > 128 ||
      !folderId.startsWith('local-folder:')
    ) {
      return null;
    }
    return localMusicService?.activateFolder(folderId) || null;
  });
  ipcMain.handle('local-music:get-folder', (_, folderId) => {
    if (
      typeof folderId !== 'string' ||
      folderId.length > 128 ||
      !folderId.startsWith('local-folder:')
    ) {
      return null;
    }
    return localMusicService?.getFolder(folderId) || null;
  });
  ipcMain.handle('local-music:close-folder', (_, folderId) => {
    if (
      typeof folderId === 'string' &&
      folderId.length <= 128 &&
      folderId.startsWith('local-folder:')
    ) {
      localMusicService?.deactivateFolder(folderId);
    }
  });
  ipcMain.handle('local-music:refresh-folder', (_, folderId) => {
    if (
      typeof folderId !== 'string' ||
      folderId.length > 128 ||
      !folderId.startsWith('local-folder:')
    ) {
      return null;
    }
    return localMusicService?.refreshFolder(folderId) || null;
  });
  ipcMain.handle('local-music:remove-folder', (_, folderId) => {
    if (
      typeof folderId !== 'string' ||
      folderId.length > 128 ||
      !folderId.startsWith('local-folder:')
    ) {
      return localMusicService?.listFolders() || [];
    }
    return localMusicService?.removeFolder(folderId) || [];
  });

  ipcMain.handle('streaming:list-connections', () =>
    streamingService?.listConnections()
  );
  ipcMain.handle('streaming:connect', (_, input) =>
    streamingService?.connect(input)
  );
  ipcMain.handle('streaming:disconnect', (_, connectionId) => {
    if (typeof connectionId !== 'string' || connectionId.length > 128) {
      return streamingService?.listConnections() || [];
    }
    return streamingService?.disconnect(connectionId) || [];
  });
  ipcMain.handle('streaming:libraries', (_, connectionId) => {
    if (typeof connectionId !== 'string' || connectionId.length > 128) {
      return [];
    }
    return streamingService?.getLibraries(connectionId) || [];
  });
  ipcMain.handle('streaming:tracks', (_, query) => {
    if (
      !isRecord(query) ||
      typeof query.connectionId !== 'string' ||
      query.connectionId.length > 128
    ) {
      return { tracks: [], total: 0 };
    }
    return (
      streamingService?.getTracks({
        connectionId: query.connectionId,
        parentId:
          typeof query.parentId === 'string'
            ? query.parentId.slice(0, 512)
            : '',
        search:
          typeof query.search === 'string' ? query.search.slice(0, 256) : '',
        startIndex: query.startIndex,
        limit: query.limit,
      }) || { tracks: [], total: 0 }
    );
  });
  ipcMain.handle('streaming:get-track', (_, trackId) => {
    if (
      typeof trackId !== 'string' ||
      trackId.length > 1024 ||
      !trackId.startsWith('stream:')
    ) {
      return null;
    }
    return streamingService?.getTrack(trackId) || null;
  });

  ipcMain.handle('open-netease-web-login', async () => {
    const loginSession = session.fromPartition('persist:netease-web-login');
    const existingCookieString = await getNeteaseCookieString(loginSession);
    if (existingCookieString.includes('MUSIC_U=')) {
      return existingCookieString;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const loginWindow = new BrowserWindow({
        width: 960,
        height: 720,
        parent: win,
        title: 'NetEase Web Login',
        webPreferences: {
          partition: 'persist:netease-web-login',
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const cleanup = () => {
        loginSession.cookies.removeListener('changed', handleCookieChanged);
        loginWindow.removeListener('closed', handleClosed);
      };

      const finish = cookieString => {
        if (settled) return;
        settled = true;
        cleanup();
        if (!loginWindow.isDestroyed()) loginWindow.close();
        resolve(cookieString);
      };

      const fail = error => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      const checkLoginCookie = async () => {
        try {
          const cookieString = await getNeteaseCookieString(loginSession);
          if (cookieString.includes('MUSIC_U=')) finish(cookieString);
        } catch (error) {
          fail(error);
        }
      };

      const handleCookieChanged = (_event, cookie) => {
        if (cookie.domain?.includes('music.163.com')) {
          checkLoginCookie();
        }
      };

      const handleClosed = () => {
        if (!settled) {
          cleanup();
          resolve('');
        }
      };

      loginSession.cookies.on('changed', handleCookieChanged);
      loginWindow.on('closed', handleClosed);
      loginWindow.loadURL('https://music.163.com/#/login').catch(fail);
    });
  });

  ipcMain.handle('open-external-url', async (_, url) => {
    if (typeof url !== 'string') {
      return false;
    }

    const normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      return false;
    }

    await shell.openExternal(normalizedUrl);
    return true;
  });

  ipcMain.handle('open-resolver-admin-panel', async (_, url) => {
    if (typeof url !== 'string') {
      return false;
    }

    const normalizedUrl = url.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      return false;
    }

    if (resolverAdminWindow && !resolverAdminWindow.isDestroyed()) {
      resolverAdminWindow.loadURL(normalizedUrl);
      resolverAdminWindow.focus();
      return true;
    }

    resolverAdminWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      parent: win,
      title: 'Resolver 管理面板',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    resolverAdminWindow.on('closed', () => {
      resolverAdminWindow = null;
    });

    resolverAdminWindow.loadURL(normalizedUrl);
    resolverAdminWindow.focus();
    return true;
  });

  ipcMain.on('close', e => {
    if (isMac) {
      win.hide();
      exitAsk(e, win);
    } else {
      let closeOpt = store.get('settings.closeAppOption');
      if (closeOpt === 'exit') {
        win = null;
        //app.quit();
        app.exit(); //exit()直接关闭客户端，不会执行quit();
      } else if (closeOpt === 'minimizeToTray') {
        e.preventDefault();
        win.hide();
      } else {
        exitAskWithoutMac(e, win);
      }
    }
  });

  ipcMain.on('minimize', () => {
    win.minimize();
  });

  ipcMain.on('maximizeOrUnmaximize', () => {
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });

  ipcMain.on('showNativeAlert', (_, message) => {
    if (typeof message !== 'string') return;
    dialog.showMessageBoxSync(win, {
      type: 'warning',
      message,
    });
  });

  ipcMain.on('settings', (event, options) => {
    if (!isRecord(options)) return;
    store.set('settings', options);
    desktopLyrics?.applySettings(options.desktopLyrics, { persist: false });
    discordPresenceEnabled = options.enableDiscordRichPresence === true;
    publishDiscordStatus();
    if (discordPresenceEnabled && pendingDiscordPresence) {
      updateDiscordPresence(pendingDiscordPresence);
    }
    updateWindowShadow(win, options);
    registerGlobalShortcuts(win, store, desktopLyrics);
  });

  ipcMain.on('desktop-lyrics:update', (event, payload) => {
    if (event.sender !== win.webContents || !isRecord(payload)) return;
    desktopLyrics?.update({
      line: typeof payload.line === 'string' ? payload.line : '',
      translation:
        typeof payload.translation === 'string' ? payload.translation : '',
      playing:
        typeof payload.playing === 'boolean' ? payload.playing : undefined,
      volume: isFiniteNumberInRange(payload.volume, 0, 1)
        ? payload.volume
        : undefined,
    });
  });

  ipcMain.on('desktop-lyrics:command', (event, command) => {
    if (!desktopLyrics?.isSender(event.sender) || !isRecord(command)) return;
    desktopLyrics.handleCommand(command);
  });

  ipcMain.on('desktop-lyrics:settings', (event, patch) => {
    if (event.sender !== win.webContents || !isRecord(patch)) return;
    desktopLyrics?.patchSettings(patch);
  });

  ipcMain.on('desktop-lyrics:toggle', event => {
    if (event.sender !== win.webContents) return;
    desktopLyrics?.toggle();
  });

  ipcMain.on('desktop-lyrics:reset-position', event => {
    if (event.sender !== win.webContents) return;
    desktopLyrics?.resetPosition();
  });

  ipcMain.on('desktop-lyrics:reset-style', event => {
    if (event.sender !== win.webContents) return;
    desktopLyrics?.resetStyle();
  });

  ipcMain.on('playDiscordPresence', (event, payload) => {
    const track = isRecord(payload?.track) ? payload.track : payload;
    if (!isRecord(track) || !Array.isArray(track.ar) || !isRecord(track.al)) {
      return;
    }
    const position = isFiniteNumberInRange(payload?.position, 0)
      ? payload.position
      : 0;
    const playbackRate = isFiniteNumberInRange(payload?.playbackRate, 0.5, 2)
      ? payload.playbackRate
      : 1;
    const { endTimestamp, startTimestamp } = getDiscordProgressTimestamps({
      durationMs: track.dt,
      playbackRate,
      positionSeconds: position,
    });
    pendingDiscordPresence = {
      details: track.name + ' - ' + track.ar.map(ar => ar.name).join(','),
      state: track.al.name,
      startTimestamp,
      endTimestamp,
      largeImageKey: track.al.picUrl,
      largeImageText: 'Listening ' + track.name,
      smallImageKey: 'play',
      smallImageText: 'Playing',
      instance: true,
    };
    updateDiscordPresence(pendingDiscordPresence);
  });

  ipcMain.on('pauseDiscordPresence', (event, track) => {
    if (!isRecord(track) || !Array.isArray(track.ar) || !isRecord(track.al)) {
      return;
    }
    pendingDiscordPresence = {
      details: track.name + ' - ' + track.ar.map(ar => ar.name).join(','),
      state: track.al.name,
      largeImageKey: track.al.picUrl,
      largeImageText: 'YesPlayMusic',
      smallImageKey: 'pause',
      smallImageText: 'Pause',
      instance: true,
    };
    updateDiscordPresence(pendingDiscordPresence);
  });

  ipcMain.on('setProxy', (event, config) => {
    if (!isValidProxyConfig(config)) return;
    const proxyRules = `${config.protocol}://${config.server}:${config.port}`;
    store.set('proxy', proxyRules);
    win.webContents.session.setProxy(
      {
        proxyRules,
      },
      () => {
        log('finished setProxy');
      }
    );
  });

  ipcMain.on('removeProxy', () => {
    log('removeProxy');
    win.webContents.session.setProxy({});
    store.set('proxy', '');
  });

  ipcMain.on('switchGlobalShortcutStatusTemporary', (e, status) => {
    if (!['enable', 'disable'].includes(status)) return;
    log('switchGlobalShortcutStatusTemporary');
    if (status === 'disable') {
      globalShortcut.unregisterAll();
    } else {
      registerGlobalShortcuts(win, store, desktopLyrics);
    }
  });

  ipcMain.on('updateShortcut', (e, payload) => {
    if (!isRecord(payload)) return;
    const { accelerator, enabled, id, scope } = payload;
    if (
      !isNonEmptyString(id) ||
      !['local', 'global'].includes(scope) ||
      (typeof accelerator !== 'string' && typeof enabled !== 'boolean')
    ) {
      return;
    }
    log('updateShortcut');
    const currentShortcuts = normalizeShortcuts(
      store.get('settings.shortcuts')
    );
    const currentShortcut = currentShortcuts.find(
      shortcut => shortcut.id === id
    );
    if (!currentShortcut) return;
    if (typeof accelerator === 'string') {
      currentShortcut[scope].accelerator = accelerator;
    }
    if (typeof enabled === 'boolean') {
      currentShortcut[scope].enabled = enabled;
    }
    store.set('settings.shortcuts', currentShortcuts);

    createMenu(win, store);
    registerGlobalShortcuts(win, store, desktopLyrics);
  });

  ipcMain.on('restoreDefaultShortcuts', () => {
    log('restoreDefaultShortcuts');
    store.set('settings.shortcuts', cloneDeep(shortcuts));

    createMenu(win, store);
    registerGlobalShortcuts(win, store, desktopLyrics);
  });

  if (isCreateTray) {
    ipcMain.on('updateTrayTooltip', (_, title) => {
      trayEventEmitter.emit('updateTooltip', title);
    });
    ipcMain.on('updateTrayPlayState', (_, isPlaying) => {
      trayEventEmitter.emit('updatePlayState', isPlaying);
    });
    ipcMain.on('updateTrayLikeState', (_, isLiked) => {
      trayEventEmitter.emit('updateLikeState', isLiked);
    });
    ipcMain.on('updateTrayIcon', () => {
      trayEventEmitter.emit('updateIcon');
    });
  }
}

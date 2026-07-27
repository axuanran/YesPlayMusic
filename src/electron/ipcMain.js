import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
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
  getDiscordProgressTimestamps,
  shouldShowDiscordStatus,
} from './discordPresence.js';

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
    shouldShowDiscordStatus(discordConnected, discordPresenceEnabled)
  );
};

client.on('connected', () => {
  discordConnected = true;
  publishDiscordStatus();
});

client.on('error', err => {
  discordConnected = false;
  publishDiscordStatus();
  const errorMessage = err instanceof Error ? err.message : `${err}`;
  log(`discord rich presence unavailable: ${errorMessage}`);
});

const updateDiscordPresence = presence => {
  try {
    client.updatePresence(presence);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : `${err}`;
    log(`discord rich presence unavailable: ${errorMessage}`);
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

export function initIpcMain(win, store, trayEventEmitter) {
  discordStatusWindow = win;
  discordPresenceEnabled =
    store.get('settings.enableDiscordRichPresence') === true;
  win.webContents.on('did-finish-load', publishDiscordStatus);
  ipcMain.handle('discord:get-status', () =>
    shouldShowDiscordStatus(discordConnected, discordPresenceEnabled)
  );

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
    discordPresenceEnabled = options.enableDiscordRichPresence === true;
    publishDiscordStatus();
    updateWindowShadow(win, options);
    registerGlobalShortcuts(win, store);
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
    updateDiscordPresence({
      details: track.name + ' - ' + track.ar.map(ar => ar.name).join(','),
      state: track.al.name,
      startTimestamp,
      endTimestamp,
      largeImageKey: track.al.picUrl,
      largeImageText: 'Listening ' + track.name,
      smallImageKey: 'play',
      smallImageText: 'Playing',
      instance: true,
    });
  });

  ipcMain.on('pauseDiscordPresence', (event, track) => {
    if (!isRecord(track) || !Array.isArray(track.ar) || !isRecord(track.al)) {
      return;
    }
    updateDiscordPresence({
      details: track.name + ' - ' + track.ar.map(ar => ar.name).join(','),
      state: track.al.name,
      largeImageKey: track.al.picUrl,
      largeImageText: 'YesPlayMusic',
      smallImageKey: 'pause',
      smallImageText: 'Pause',
      instance: true,
    });
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
      registerGlobalShortcuts(win, store);
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
    registerGlobalShortcuts(win, store);
  });

  ipcMain.on('restoreDefaultShortcuts', () => {
    log('restoreDefaultShortcuts');
    store.set('settings.shortcuts', cloneDeep(shortcuts));

    createMenu(win, store);
    registerGlobalShortcuts(win, store);
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

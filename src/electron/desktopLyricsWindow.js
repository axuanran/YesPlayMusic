import { BrowserWindow, screen } from 'electron';
import {
  DEFAULT_DESKTOP_LYRICS_SETTINGS,
  mergeDesktopLyricsSettings,
  normalizeDesktopLyricsSettings,
} from '../utils/desktopLyricsSettings.js';

const DESKTOP_LYRICS_CHANNEL = 'desktop-lyrics:render';
const SETTINGS_CHANNEL = 'desktop-lyrics:settings';
const WINDOW_MARGIN = 16;
const WINDOW_BOTTOM_OFFSET = 96;
const SAVE_BOUNDS_DELAY = 250;

const normalizeText = value =>
  typeof value === 'string' ? value.slice(0, 2048) : '';

const workAreaContains = (workArea, bounds) =>
  bounds.x < workArea.x + workArea.width &&
  bounds.x + bounds.width > workArea.x &&
  bounds.y < workArea.y + workArea.height &&
  bounds.y + bounds.height > workArea.y;

export function buildDesktopLyricsHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      :root {
        --lyrics-font-size: 32px;
        --lyrics-secondary-font-size: 18px;
        --lyrics-text-color: #fff;
        --lyrics-secondary-color: #d6e0ff;
        --lyrics-text-align: center;
        --lyrics-background-opacity: 0;
      }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, sans-serif;
        user-select: none;
        -webkit-app-region: drag;
      }
      body::before {
        position: absolute;
        inset: 0;
        border-radius: 12px;
        background: rgba(0, 0, 0, var(--lyrics-background-opacity));
        content: "";
        pointer-events: none;
      }
      #lyrics { z-index: 1; width: 100%; padding: 12px 24px 36px; text-align: var(--lyrics-text-align); }
      #line, #translation {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-shadow: 0 2px 5px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.75);
      }
      #line { color: var(--lyrics-text-color); font-size: var(--lyrics-font-size); font-weight: 750; line-height: 1.35; }
      #translation { margin-top: 3px; color: var(--lyrics-secondary-color); font-size: var(--lyrics-secondary-font-size); font-weight: 600; line-height: 1.3; }
      #translation:empty, .hide-secondary #translation { display: none; }
      #controls {
        z-index: 2;
        position: absolute;
        right: 10px;
        bottom: 8px;
        left: 10px;
        display: flex;
        gap: 6px;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity .15s ease;
      }
      body:not(.is-locked):hover #controls { opacity: 1; }
      button, input { -webkit-app-region: no-drag; }
      button {
        border: 0;
        border-radius: 7px;
        padding: 4px 8px;
        color: #fff;
        background: rgba(0, 0, 0, .55);
        cursor: pointer;
      }
      #volume { width: 90px; }
      .is-locked #controls { display: none; }
    </style>
  </head>
  <body class="is-locked">
    <div id="lyrics">
      <div id="line"></div>
      <div id="translation"></div>
    </div>
    <div id="controls">
      <button id="previous" type="button">上一首</button>
      <button id="play" type="button">播放</button>
      <button id="next" type="button">下一首</button>
      <input id="volume" aria-label="音量" type="range" min="0" max="100" value="100">
      <button id="settings" type="button">设置</button>
      <button id="lock" type="button">锁定</button>
      <button id="hide" type="button">隐藏</button>
    </div>
  </body>
</html>`;
}

export class DesktopLyricsWindow {
  constructor({
    WindowClass = BrowserWindow,
    getDisplays = () => screen.getAllDisplays(),
    preloadPath,
    store = null,
    mainWindow = null,
  }) {
    this.WindowClass = WindowClass;
    this.getDisplays = getDisplays;
    this.preloadPath = preloadPath;
    this.store = store;
    this.mainWindow = mainWindow;
    this.window = null;
    this.saveBoundsTimer = null;
    this.currentLyrics = {
      line: '',
      translation: '',
      playing: false,
      volume: 1,
    };
    this.settings = this.readSettings();
  }

  readSettings() {
    const appSettings = this.store?.get?.('settings') || {};
    return normalizeDesktopLyricsSettings(
      appSettings.desktopLyrics,
      appSettings.enableDesktopLyrics ?? appSettings.enableOsdlyricsSupport
    );
  }

  persistSettings() {
    if (!this.store?.set) return;
    const appSettings = this.store.get('settings') || {};
    this.store.set('settings', {
      ...appSettings,
      enableDesktopLyrics: this.settings.enabled,
      desktopLyrics: this.settings,
    });
  }

  notifyMainWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed?.()) return;
    this.mainWindow.webContents.send(
      'desktop-lyrics:settings-changed',
      this.settings
    );
  }

  applySettings(value, { persist = false, notify = false } = {}) {
    this.settings = mergeDesktopLyricsSettings(this.settings, value);
    if (persist) this.persistSettings();
    if (notify) this.notifyMainWindow();

    if (!this.settings.enabled) {
      this.destroyWindow();
      return;
    }
    if (!this.settings.visible) {
      this.window?.hide?.();
      return;
    }

    const lyricsWindow = this.ensureWindow();
    this.applyWindowSettings(lyricsWindow);
    this.render();
    lyricsWindow.showInactive?.();
  }

  patchSettings(patch) {
    this.applySettings(patch, { persist: true, notify: true });
  }

  setEnabled(enabled) {
    this.applySettings(
      { enabled: enabled === true, visible: enabled === true },
      { persist: false }
    );
  }

  toggle() {
    this.patchSettings({
      enabled: true,
      visible: !(this.settings.enabled && this.settings.visible),
    });
  }

  setLocked(locked) {
    this.patchSettings({ locked: locked === true });
  }

  resetPosition() {
    this.patchSettings({ x: null, y: null });
    if (this.window && !this.window.isDestroyed()) {
      this.window.setBounds(this.resolveBounds(this.settings));
    }
  }

  resetStyle() {
    const defaults = DEFAULT_DESKTOP_LYRICS_SETTINGS;
    this.patchSettings({
      fontSize: defaults.fontSize,
      secondaryFontSize: defaults.secondaryFontSize,
      textAlign: defaults.textAlign,
      textColor: defaults.textColor,
      secondaryColor: defaults.secondaryColor,
      backgroundOpacity: defaults.backgroundOpacity,
    });
  }

  update(payload = {}) {
    this.currentLyrics = {
      line: normalizeText(payload.line),
      translation: normalizeText(payload.translation),
      playing:
        typeof payload.playing === 'boolean'
          ? payload.playing
          : this.currentLyrics.playing,
      volume: Number.isFinite(payload.volume)
        ? Math.min(1, Math.max(0, payload.volume))
        : this.currentLyrics.volume,
    };
    if (!this.settings.enabled || !this.settings.visible) return;
    this.ensureWindow();
    this.render();
  }

  resolveBounds(settings = this.settings) {
    const displays = this.getDisplays();
    const primary = displays[0]?.workArea || {
      x: 0,
      y: 0,
      width: settings.width,
      height: settings.height + WINDOW_BOTTOM_OFFSET,
    };
    const width = Math.min(
      settings.width,
      Math.max(360, primary.width - WINDOW_MARGIN * 2)
    );
    const height = Math.min(
      settings.height,
      Math.max(92, primary.height - WINDOW_MARGIN * 2)
    );
    const saved = {
      width,
      height,
      x: settings.x,
      y: settings.y,
    };
    if (
      Number.isFinite(saved.x) &&
      Number.isFinite(saved.y) &&
      displays.some(display => workAreaContains(display.workArea, saved))
    ) {
      return saved;
    }
    return {
      width,
      height,
      x: Math.round(primary.x + (primary.width - width) / 2),
      y: Math.round(primary.y + primary.height - height - WINDOW_BOTTOM_OFFSET),
    };
  }

  ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const bounds = this.resolveBounds();
    const lyricsWindow = new this.WindowClass({
      alwaysOnTop: this.settings.alwaysOnTop,
      backgroundColor: '#00000000',
      focusable: !this.settings.locked,
      frame: false,
      hasShadow: false,
      resizable: !this.settings.locked,
      show: false,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: this.preloadPath,
        sandbox: true,
      },
      ...bounds,
    });

    this.window = lyricsWindow;
    this.applyWindowSettings(lyricsWindow);
    lyricsWindow.setVisibleOnAllWorkspaces?.(true, {
      visibleOnFullScreen: true,
    });
    lyricsWindow.on('move', () => this.queueBoundsSave());
    lyricsWindow.on('resize', () => this.queueBoundsSave());
    lyricsWindow.on('closed', () => {
      if (this.window === lyricsWindow) this.window = null;
    });
    lyricsWindow.webContents.on('did-finish-load', () => {
      if (!this.settings.enabled || lyricsWindow.isDestroyed()) return;
      this.render();
      lyricsWindow.showInactive();
    });
    lyricsWindow.loadURL(
      `data:text/html;charset=UTF-8,${encodeURIComponent(
        buildDesktopLyricsHtml()
      )}`
    );
    return lyricsWindow;
  }

  applyWindowSettings(lyricsWindow) {
    if (!lyricsWindow || lyricsWindow.isDestroyed()) return;
    lyricsWindow.setAlwaysOnTop?.(
      this.settings.alwaysOnTop,
      this.settings.alwaysOnTop ? 'floating' : 'normal'
    );
    lyricsWindow.setIgnoreMouseEvents?.(this.settings.locked, {
      forward: true,
    });
    lyricsWindow.setFocusable?.(!this.settings.locked);
    lyricsWindow.setResizable?.(!this.settings.locked);
    lyricsWindow.webContents.send?.(SETTINGS_CHANNEL, this.settings);
  }

  queueBoundsSave() {
    clearTimeout(this.saveBoundsTimer);
    this.saveBoundsTimer = setTimeout(() => {
      if (!this.window || this.window.isDestroyed()) return;
      const bounds = this.window.getBounds();
      this.settings = mergeDesktopLyricsSettings(this.settings, bounds);
      this.persistSettings();
      this.notifyMainWindow();
    }, SAVE_BOUNDS_DELAY);
  }

  render() {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(DESKTOP_LYRICS_CHANNEL, {
      ...this.currentLyrics,
      settings: this.settings,
    });
  }

  isSender(sender) {
    return Boolean(
      this.window &&
      !this.window.isDestroyed() &&
      sender === this.window.webContents
    );
  }

  handleCommand(command = {}) {
    if (!command || typeof command.type !== 'string') return;
    switch (command.type) {
      case 'ready':
        this.render();
        break;
      case 'previous':
        this.mainWindow?.webContents.send('previous');
        break;
      case 'play':
        this.mainWindow?.webContents.send('play');
        break;
      case 'next':
        this.mainWindow?.webContents.send('next');
        break;
      case 'setVolume':
        if (Number.isFinite(command.value)) {
          const volume = Math.min(1, Math.max(0, command.value));
          this.mainWindow?.webContents.send('setVolume', volume);
        }
        break;
      case 'lock':
        this.setLocked(true);
        break;
      case 'hide':
        this.patchSettings({ visible: false });
        break;
      case 'openSettings':
        this.mainWindow?.show?.();
        this.mainWindow?.focus?.();
        this.mainWindow?.webContents.send('changeRouteTo', '/settings');
        break;
    }
  }

  destroyWindow() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  dispose() {
    clearTimeout(this.saveBoundsTimer);
    this.settings.enabled = false;
    this.destroyWindow();
  }
}

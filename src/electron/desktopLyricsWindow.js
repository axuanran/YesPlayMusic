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
const WM_MOUSEWHEEL = 0x020a;
const MIN_WINDOW_WIDTH = 360;
const MIN_WINDOW_HEIGHT = 92;
const MAX_WINDOW_WIDTH = 1920;
const MAX_WINDOW_HEIGHT = 400;

const normalizeText = value =>
  typeof value === 'string' ? value.slice(0, 2048) : '';

const intersectionArea = (workArea, bounds) => {
  const width =
    Math.min(workArea.x + workArea.width, bounds.x + bounds.width) -
    Math.max(workArea.x, bounds.x);
  const height =
    Math.min(workArea.y + workArea.height, bounds.y + bounds.height) -
    Math.max(workArea.y, bounds.y);
  return Math.max(0, width) * Math.max(0, height);
};

const clampBoundsToWorkArea = (workArea, bounds) => {
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  return {
    width,
    height,
    x: Math.min(
      Math.max(bounds.x, workArea.x),
      workArea.x + workArea.width - width
    ),
    y: Math.min(
      Math.max(bounds.y, workArea.y),
      workArea.y + workArea.height - height
    ),
  };
};

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
        cursor: move;
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
      body::after {
        position: absolute;
        z-index: 3;
        inset: 0;
        border: 1px solid rgba(255, 255, 255, .2);
        border-radius: 12px;
        content: "";
        opacity: 0;
        pointer-events: none;
        transition: opacity .15s ease;
      }
      body:not(.is-locked):hover::after { opacity: 1; }
      #lyrics {
        z-index: 1;
        width: 100%;
        padding: 12px 24px 36px;
        text-align: var(--lyrics-text-align);
      }
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
      .resize-handle {
        z-index: 4;
        position: absolute;
        -webkit-app-region: no-drag;
      }
      .resize-handle[data-resize-edge="n"],
      .resize-handle[data-resize-edge="s"] {
        right: 14px;
        left: 14px;
        height: 8px;
      }
      .resize-handle[data-resize-edge="n"] { top: 0; cursor: ns-resize; }
      .resize-handle[data-resize-edge="s"] { bottom: 0; cursor: ns-resize; }
      .resize-handle[data-resize-edge="e"],
      .resize-handle[data-resize-edge="w"] {
        top: 14px;
        bottom: 14px;
        width: 8px;
      }
      .resize-handle[data-resize-edge="e"] { right: 0; cursor: ew-resize; }
      .resize-handle[data-resize-edge="w"] { left: 0; cursor: ew-resize; }
      .resize-handle[data-resize-edge="ne"],
      .resize-handle[data-resize-edge="nw"],
      .resize-handle[data-resize-edge="se"],
      .resize-handle[data-resize-edge="sw"] {
        width: 14px;
        height: 14px;
      }
      .resize-handle[data-resize-edge="ne"] { top: 0; right: 0; cursor: nesw-resize; }
      .resize-handle[data-resize-edge="nw"] { top: 0; left: 0; cursor: nwse-resize; }
      .resize-handle[data-resize-edge="se"] { right: 0; bottom: 0; cursor: nwse-resize; }
      .resize-handle[data-resize-edge="sw"] { bottom: 0; left: 0; cursor: nesw-resize; }
      .is-locked .resize-handle { display: none; }
      #opacity-indicator {
        z-index: 3;
        position: absolute;
        top: 8px;
        right: 10px;
        border-radius: 7px;
        padding: 4px 8px;
        color: #fff;
        background: rgba(0, 0, 0, .58);
        font-size: 12px;
        opacity: 0;
        pointer-events: none;
        transform: translateY(-4px);
        transition: opacity .16s ease, transform .16s ease;
        -webkit-app-region: no-drag;
      }
      #opacity-indicator.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
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
    <div id="opacity-indicator" role="status"></div>
    <div class="resize-handle" data-resize-edge="n"></div>
    <div class="resize-handle" data-resize-edge="ne"></div>
    <div class="resize-handle" data-resize-edge="e"></div>
    <div class="resize-handle" data-resize-edge="se"></div>
    <div class="resize-handle" data-resize-edge="s"></div>
    <div class="resize-handle" data-resize-edge="sw"></div>
    <div class="resize-handle" data-resize-edge="w"></div>
    <div class="resize-handle" data-resize-edge="nw"></div>
  </body>
</html>`;
}

export class DesktopLyricsWindow {
  constructor({
    WindowClass = BrowserWindow,
    getCursorPoint = () => screen.getCursorScreenPoint(),
    getDisplays = () => screen.getAllDisplays(),
    preloadPath,
    store = null,
    mainWindow = null,
  }) {
    this.WindowClass = WindowClass;
    this.getCursorPoint = getCursorPoint;
    this.getDisplays = getDisplays;
    this.preloadPath = preloadPath;
    this.store = store;
    this.mainWindow = mainWindow;
    this.window = null;
    this.saveBoundsTimer = null;
    this.resizeState = null;
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
    if (locked === true) this.endResize();
    this.patchSettings({ locked: locked === true });
  }

  toggleLocked() {
    this.setLocked(!this.settings.locked);
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
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const matchedDisplay = displays
        .map(display => ({
          display,
          intersection: intersectionArea(display.workArea, saved),
        }))
        .sort((left, right) => right.intersection - left.intersection)[0];
      if (matchedDisplay?.intersection > 0) {
        return clampBoundsToWorkArea(matchedDisplay.display.workArea, saved);
      }
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
      maxHeight: MAX_WINDOW_HEIGHT,
      maxWidth: MAX_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      minWidth: MIN_WINDOW_WIDTH,
      // Windows can treat arbitrary areas of transparent frameless windows as
      // native resize borders. Position and size are therefore controlled
      // explicitly instead of delegating resizing to the operating system.
      resizable: false,
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
    lyricsWindow.on('will-resize', event => event.preventDefault());
    if (
      process.platform === 'win32' &&
      typeof lyricsWindow.hookWindowMessage === 'function'
    ) {
      lyricsWindow.hookWindowMessage(WM_MOUSEWHEEL, wParam => {
        if (this.settings.locked || !Buffer.isBuffer(wParam)) return;
        const value = wParam.readUInt32LE(0);
        const unsignedDelta = (value >>> 16) & 0xffff;
        const delta =
          unsignedDelta & 0x8000 ? unsignedDelta - 0x10000 : unsignedDelta;
        this.handleWheelDelta(delta);
      });
    } else {
      lyricsWindow.webContents.on('input-event', (_event, input) => {
        if (input?.type !== 'mouseWheel') return;
        this.handleWheelDelta(-Number(input.deltaY));
      });
    }
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
    lyricsWindow.webContents.send?.(SETTINGS_CHANNEL, this.settings);
  }

  queueBoundsSave() {
    clearTimeout(this.saveBoundsTimer);
    this.saveBoundsTimer = setTimeout(() => {
      if (!this.window || this.window.isDestroyed()) return;
      const bounds = this.window.getBounds();
      const resolvedBounds = this.resolveBounds({
        ...this.settings,
        ...bounds,
      });
      if (
        Object.keys(resolvedBounds).some(
          key => resolvedBounds[key] !== bounds[key]
        )
      ) {
        this.window.setBounds(resolvedBounds, false);
      }
      this.settings = mergeDesktopLyricsSettings(this.settings, resolvedBounds);
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
      case 'adjustBackgroundOpacity':
        if (!this.settings.locked && Number.isFinite(command.value)) {
          this.adjustBackgroundOpacity(command.value);
        }
        break;
      case 'startResize':
        this.startResize(command.value);
        break;
      case 'moveResize':
        this.moveResize();
        break;
      case 'endResize':
        this.endResize();
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

  adjustBackgroundOpacity(direction) {
    const normalizedDirection = Math.sign(Number(direction));
    if (normalizedDirection === 0) return;
    this.patchSettings({
      backgroundOpacity:
        Math.round(
          (this.settings.backgroundOpacity + normalizedDirection * 0.1) * 10
        ) / 10,
    });
  }

  handleWheelDelta(delta) {
    if (this.settings.locked || !Number.isFinite(delta) || delta === 0) return;
    this.adjustBackgroundOpacity(Math.sign(delta));
  }

  startResize(edge) {
    if (
      this.settings.locked ||
      !/^(n|ne|e|se|s|sw|w|nw)$/.test(edge) ||
      !this.window ||
      this.window.isDestroyed()
    ) {
      return;
    }
    const point = this.getCursorPoint();
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
    this.resizeState = {
      bounds: this.window.getBounds(),
      edge,
      pointerX: point.x,
      pointerY: point.y,
    };
  }

  moveResize() {
    if (
      this.settings.locked ||
      !this.resizeState ||
      !this.window ||
      this.window.isDestroyed()
    ) {
      return;
    }
    const point = this.getCursorPoint();
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;
    const { bounds, edge, pointerX, pointerY } = this.resizeState;
    const deltaX = point.x - pointerX;
    const deltaY = point.y - pointerY;
    let width = bounds.width;
    let height = bounds.height;
    let x = bounds.x;
    let y = bounds.y;

    if (edge.includes('e')) {
      width = Math.min(
        MAX_WINDOW_WIDTH,
        Math.max(MIN_WINDOW_WIDTH, bounds.width + deltaX)
      );
    }
    if (edge.includes('s')) {
      height = Math.min(
        MAX_WINDOW_HEIGHT,
        Math.max(MIN_WINDOW_HEIGHT, bounds.height + deltaY)
      );
    }
    if (edge.includes('w')) {
      width = Math.min(
        MAX_WINDOW_WIDTH,
        Math.max(MIN_WINDOW_WIDTH, bounds.width - deltaX)
      );
      x = bounds.x + bounds.width - width;
    }
    if (edge.includes('n')) {
      height = Math.min(
        MAX_WINDOW_HEIGHT,
        Math.max(MIN_WINDOW_HEIGHT, bounds.height - deltaY)
      );
      y = bounds.y + bounds.height - height;
    }

    const nextBounds = {
      height: Math.round(height),
      width: Math.round(width),
      x: Math.round(x),
      y: Math.round(y),
    };
    const currentBounds = this.window.getBounds();
    if (
      nextBounds.x === currentBounds.x &&
      nextBounds.y === currentBounds.y &&
      nextBounds.width === currentBounds.width &&
      nextBounds.height === currentBounds.height
    ) {
      return;
    }
    this.window.setBounds(nextBounds, false);
  }

  endResize() {
    this.resizeState = null;
  }

  destroyWindow() {
    this.resizeState = null;
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

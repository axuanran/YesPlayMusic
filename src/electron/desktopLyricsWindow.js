import { BrowserWindow, screen } from 'electron';

const DESKTOP_LYRICS_CHANNEL = 'desktop-lyrics:render';
const WINDOW_HEIGHT = 120;
const WINDOW_MAX_WIDTH = 960;
const WINDOW_MARGIN = 48;
const WINDOW_BOTTOM_OFFSET = 96;

export function buildDesktopLyricsHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
      body { display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; user-select: none; }
      #lyrics { width: 100%; padding: 12px 24px; text-align: center; color: #fff; }
      #line, #translation {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-shadow: 0 2px 5px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.75);
      }
      #line { font-size: 32px; font-weight: 750; line-height: 1.35; }
      #translation { margin-top: 3px; font-size: 18px; font-weight: 600; opacity: .88; line-height: 1.3; }
      #translation:empty { display: none; }
    </style>
  </head>
  <body>
    <div id="lyrics">
      <div id="line"></div>
      <div id="translation"></div>
    </div>
    <script>
      window.electronAPI?.desktopLyrics?.onUpdate?.((payload) => {
        document.getElementById('line').textContent = payload.line || '';
        document.getElementById('translation').textContent = payload.translation || '';
      });
    </script>
  </body>
</html>`;
}

const normalizeText = value =>
  typeof value === 'string' ? value.slice(0, 2048) : '';

export class DesktopLyricsWindow {
  constructor({
    WindowClass = BrowserWindow,
    getWorkArea = () => screen.getPrimaryDisplay().workArea,
    preloadPath,
  }) {
    this.WindowClass = WindowClass;
    this.getWorkArea = getWorkArea;
    this.preloadPath = preloadPath;
    this.enabled = false;
    this.window = null;
    this.currentLyrics = { line: '', translation: '' };
  }

  setEnabled(enabled) {
    this.enabled = enabled === true;
    if (this.enabled) {
      this.ensureWindow();
    } else {
      this.destroyWindow();
    }
  }

  update(payload = {}) {
    this.currentLyrics = {
      line: normalizeText(payload.line),
      translation: normalizeText(payload.translation),
    };
    if (!this.enabled) return;
    this.ensureWindow();
    this.render();
  }

  ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const workArea = this.getWorkArea();
    const width = Math.min(
      WINDOW_MAX_WIDTH,
      Math.max(320, workArea.width - WINDOW_MARGIN * 2)
    );
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const y = Math.round(
      workArea.y + workArea.height - WINDOW_HEIGHT - WINDOW_BOTTOM_OFFSET
    );

    const lyricsWindow = new this.WindowClass({
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      focusable: false,
      frame: false,
      hasShadow: false,
      height: WINDOW_HEIGHT,
      resizable: false,
      show: false,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: this.preloadPath,
        sandbox: false,
      },
      width,
      x,
      y,
    });

    this.window = lyricsWindow;
    lyricsWindow.setAlwaysOnTop(true, 'floating');
    lyricsWindow.setIgnoreMouseEvents(true, { forward: true });
    lyricsWindow.setVisibleOnAllWorkspaces?.(true, {
      visibleOnFullScreen: true,
    });
    lyricsWindow.on('closed', () => {
      if (this.window === lyricsWindow) this.window = null;
    });
    lyricsWindow.webContents.on('did-finish-load', () => {
      if (!this.enabled || lyricsWindow.isDestroyed()) return;
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

  render() {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(DESKTOP_LYRICS_CHANNEL, this.currentLyrics);
  }

  destroyWindow() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  dispose() {
    this.enabled = false;
    this.destroyWindow();
  }
}

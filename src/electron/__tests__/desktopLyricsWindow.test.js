import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  screen: {
    getAllDisplays: () => [
      {
        workArea: { height: 1080, width: 1920, x: 0, y: 0 },
      },
    ],
  },
}));

import {
  buildDesktopLyricsHtml,
  DesktopLyricsWindow,
} from '../desktopLyricsWindow.js';

class MockWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.destroyed = false;
    this.webContents = new EventEmitter();
    this.webContents.send = vi.fn();
    this.destroy = vi.fn(() => {
      this.destroyed = true;
      this.emit('closed');
    });
    this.isDestroyed = vi.fn(() => this.destroyed);
    this.loadURL = vi.fn();
    this.setAlwaysOnTop = vi.fn();
    this.setFocusable = vi.fn();
    this.setIgnoreMouseEvents = vi.fn();
    this.setResizable = vi.fn();
    this.setVisibleOnAllWorkspaces = vi.fn();
    this.showInactive = vi.fn();
    this.hide = vi.fn();
    this.getBounds = vi.fn(() => ({
      height: options.height,
      width: options.width,
      x: options.x,
      y: options.y,
    }));
    this.setBounds = vi.fn();
  }
}

const createController = () =>
  new DesktopLyricsWindow({
    WindowClass: MockWindow,
    getDisplays: () => [
      { workArea: { height: 800, width: 1200, x: 10, y: 20 } },
    ],
    preloadPath: '/preload.js',
  });

describe('desktop lyrics window', () => {
  it('builds a renderer without executable page scripts', () => {
    const html = buildDesktopLyricsHtml();

    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script');
    expect(html).not.toContain('innerHTML');
  });

  it('creates a non-focusing click-through window only when enabled', () => {
    const controller = createController();

    controller.update({ line: 'Hidden' });
    expect(controller.window).toBeNull();

    controller.setEnabled(true);
    const win = controller.window;
    expect(win.options).toMatchObject({
      alwaysOnTop: true,
      focusable: false,
      frame: false,
      skipTaskbar: true,
      transparent: true,
    });
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(true, {
      forward: true,
    });
  });

  it('renders the latest line after load and destroys the window on disable', () => {
    const controller = createController();
    controller.update({ line: 'Line', translation: 'Translation' });
    controller.setEnabled(true);
    const win = controller.window;

    win.webContents.emit('did-finish-load');
    expect(win.webContents.send).toHaveBeenLastCalledWith(
      'desktop-lyrics:render',
      {
        line: 'Line',
        playing: false,
        settings: expect.objectContaining({
          enabled: true,
          locked: true,
          visible: true,
        }),
        translation: 'Translation',
        volume: 1,
      }
    );
    expect(win.showInactive).toHaveBeenCalled();

    controller.setEnabled(false);
    expect(win.destroy).toHaveBeenCalledOnce();
    expect(controller.window).toBeNull();
  });

  it('persists lock changes and enables interaction while unlocked', () => {
    let settings = {
      desktopLyrics: { enabled: true, locked: true, visible: true },
    };
    const store = {
      get: vi.fn(() => settings),
      set: vi.fn((_key, value) => {
        settings = value;
      }),
    };
    const controller = new DesktopLyricsWindow({
      WindowClass: MockWindow,
      getDisplays: () => [
        { workArea: { height: 800, width: 1200, x: 0, y: 0 } },
      ],
      preloadPath: '/desktop-lyrics.js',
      store,
    });

    controller.applySettings(controller.settings);
    controller.setLocked(false);

    expect(controller.window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(
      false,
      { forward: true }
    );
    expect(controller.window.setFocusable).toHaveBeenLastCalledWith(true);
    expect(controller.window.setResizable).toHaveBeenLastCalledWith(true);
    expect(store.set).toHaveBeenCalled();
    expect(settings.desktopLyrics.locked).toBe(false);
  });

  it('recovers an off-screen saved position', () => {
    const controller = createController();
    const bounds = controller.resolveBounds({
      ...controller.settings,
      height: 120,
      width: 960,
      x: 9000,
      y: 9000,
    });

    expect(bounds).toEqual({
      height: 120,
      width: 960,
      x: 130,
      y: 604,
    });
  });
});

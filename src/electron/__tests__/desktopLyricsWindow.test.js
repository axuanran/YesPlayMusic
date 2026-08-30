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
    this.setPosition = vi.fn();
    this.setResizable = vi.fn();
    this.hookWindowMessage = vi.fn();
    this.setVisibleOnAllWorkspaces = vi.fn();
    this.showInactive = vi.fn();
    this.hide = vi.fn();
    this.bounds = {
      height: options.height,
      width: options.width,
      x: options.x,
      y: options.y,
    };
    this.getBounds = vi.fn(() => ({ ...this.bounds }));
    this.setBounds = vi.fn(bounds => {
      this.bounds = { ...this.bounds, ...bounds };
    });
  }
}

const createController = (options = {}) =>
  new DesktopLyricsWindow({
    WindowClass: MockWindow,
    getDisplays: () => [
      { workArea: { height: 800, width: 1200, x: 10, y: 20 } },
    ],
    preloadPath: '/preload.js',
    ...options,
  });

const disabledUnlockedStore = () => ({
  get: () => ({
    desktopLyrics: {
      backgroundOpacity: 0.1,
      enabled: false,
      locked: false,
      visible: false,
    },
  }),
});

describe('desktop lyrics window', () => {
  it('builds a renderer without executable page scripts', () => {
    const html = buildDesktopLyricsHtml();

    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script');
    expect(html).not.toContain('innerHTML');
    expect(html).toContain('id="opacity-indicator"');
    expect(html).toContain('-webkit-app-region: drag');
    expect(
      html.match(/<div class="resize-handle" data-resize-edge=/g)
    ).toHaveLength(8);
  });

  it('creates an interactive unlocked window only when enabled', () => {
    const controller = createController({ store: disabledUnlockedStore() });

    controller.update({ line: 'Hidden' });
    expect(controller.window).toBeNull();

    controller.setEnabled(true);
    const win = controller.window;
    expect(win.options).toMatchObject({
      alwaysOnTop: true,
      focusable: true,
      frame: false,
      skipTaskbar: true,
      transparent: true,
    });
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(false, {
      forward: true,
    });
  });

  it('renders the latest line after load and destroys the window on disable', () => {
    const controller = createController({ store: disabledUnlockedStore() });
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
          locked: false,
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
    expect(controller.window.options.resizable).toBe(false);
    expect(controller.window.setResizable).not.toHaveBeenCalled();
    expect(store.set).toHaveBeenCalled();
    expect(settings.desktopLyrics.locked).toBe(false);
  });

  it('adjusts background opacity by wheel steps only while unlocked', () => {
    const controller = createController({ store: disabledUnlockedStore() });

    controller.setEnabled(true);
    controller.handleCommand({
      type: 'adjustBackgroundOpacity',
      value: 1,
    });
    expect(controller.settings.backgroundOpacity).toBe(0.2);

    controller.handleCommand({
      type: 'adjustBackgroundOpacity',
      value: -1,
    });
    expect(controller.settings.backgroundOpacity).toBe(0.1);

    controller.setLocked(true);
    controller.handleCommand({
      type: 'adjustBackgroundOpacity',
      value: 1,
    });
    expect(controller.settings.backgroundOpacity).toBe(0.1);
  });

  it('uses native dragging while disabling native resizing', () => {
    const controller = createController();
    controller.setEnabled(true);
    const win = controller.window;
    expect(win.options).toMatchObject({
      maxHeight: 400,
      maxWidth: 1920,
      minHeight: 92,
      minWidth: 360,
      resizable: false,
    });
    expect(win.setPosition).not.toHaveBeenCalled();
    expect(win.setResizable).not.toHaveBeenCalled();
  });

  it('resizes only from validated custom edges and clamps dimensions', () => {
    let cursorPoint = { x: 100, y: 200 };
    const controller = createController({
      getCursorPoint: () => cursorPoint,
      store: disabledUnlockedStore(),
    });
    controller.setEnabled(true);
    const win = controller.window;
    const initialBounds = win.getBounds();

    controller.handleCommand({ type: 'startResize', value: 'se' });
    cursorPoint = { x: 2100, y: 1200 };
    controller.handleCommand({ type: 'moveResize' });

    expect(win.setBounds).toHaveBeenLastCalledWith(
      {
        height: 400,
        width: 1920,
        x: initialBounds.x,
        y: initialBounds.y,
      },
      false
    );

    controller.handleCommand({ type: 'endResize' });
    controller.handleCommand({ type: 'startResize', value: 'invalid' });
    cursorPoint = { x: 0, y: 0 };
    controller.handleCommand({ type: 'moveResize' });
    expect(win.setBounds).toHaveBeenCalledOnce();
  });

  it('adjusts opacity from native wheel input', () => {
    const controller = createController({ store: disabledUnlockedStore() });
    controller.setEnabled(true);

    controller.handleWheelDelta(120);

    expect(controller.settings.backgroundOpacity).toBe(0.2);
  });

  it('blocks native resize attempts for the frameless window', () => {
    const controller = createController();
    controller.setEnabled(true);
    const event = { preventDefault: vi.fn() };

    controller.window.emit('will-resize', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('clamps a partially visible saved position into the work area', () => {
    const controller = createController();
    const bounds = controller.resolveBounds({
      ...controller.settings,
      height: 120,
      width: 960,
      x: -900,
      y: 760,
    });

    expect(bounds).toEqual({
      height: 120,
      width: 960,
      x: 10,
      y: 700,
    });
  });

  it('snaps a moved window back into the work area before saving', () => {
    vi.useFakeTimers();
    try {
      const controller = createController();
      controller.setEnabled(true);
      controller.window.bounds = {
        height: 120,
        width: 960,
        x: -900,
        y: 760,
      };

      controller.window.emit('move');
      vi.advanceTimersByTime(250);

      expect(controller.window.setBounds).toHaveBeenLastCalledWith(
        {
          height: 120,
          width: 960,
          x: 10,
          y: 700,
        },
        false
      );
    } finally {
      vi.useRealTimers();
    }
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

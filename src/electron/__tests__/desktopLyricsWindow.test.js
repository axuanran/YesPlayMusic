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
    this.webContents.setVisualZoomLevelLimits = vi.fn();
    this.webContents.setZoomLevel = vi.fn();
    this.getNativeWindowHandle = vi.fn(() => {
      const handle = Buffer.alloc(8);
      handle.writeInt32LE(4242, 0);
      return handle;
    });
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
    expect(html).toContain('id="repeat"');
    expect(html).toContain('-webkit-app-region: drag');
    expect(html).toContain('.wrap-lines #line');
    expect(html).toContain('align-items: var(--lyrics-vertical-align)');
    expect(html).toContain('drop-shadow(0 0 12px');
    expect(html).toContain('padding: 20px 32px 44px');
    expect(html).not.toContain('text-shadow: 0 2px 5px rgba(0,0,0,.95)');
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
        active: -1,
        line: 'Line',
        lines: [],
        playing: false,
        repeatLyric: false,
        roman: '',
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
  it('leaves a plain native wheel to the renderer seek command', () => {
    const mainWindow = { webContents: { send: vi.fn() } };
    const controller = createController({
      platform: 'win32',
      mainWindow,
      store: disabledUnlockedStore(),
    });
    controller.setEnabled(true);
    mainWindow.webContents.send.mockClear();
    const [, handleNativeWheel] =
      controller.window.hookWindowMessage.mock.calls[0];
    const wParam = Buffer.alloc(4);
    wParam.writeInt16LE(120, 2);

    handleNativeWheel(wParam);
    expect(mainWindow.webContents.send).not.toHaveBeenCalled();

    controller.handleCommand({ type: 'seek', value: 5 });

    const seekCalls = mainWindow.webContents.send.mock.calls.filter(
      call => call[0] === 'mpris:command'
    );
    expect(seekCalls).toHaveLength(1);
    expect(seekCalls[0]).toEqual([
      'mpris:command',
      { type: 'seek', offset: 5 },
    ]);
    expect(controller.settings.backgroundOpacity).toBe(0.1);
  });

  it('mirrors a plain native wheel to the lyric list in scroll mode', () => {
    const controller = createController({
      platform: 'win32',
      store: disabledUnlockedStore(),
    });
    controller.setEnabled(true);
    controller.patchSettings({ wheelBehavior: 'scroll' });
    controller.window.webContents.send.mockClear();
    const [, handleNativeWheel] =
      controller.window.hookWindowMessage.mock.calls[0];
    const wParam = Buffer.alloc(4);
    wParam.writeInt16LE(120, 2);

    handleNativeWheel(wParam);

    expect(controller.window.webContents.send).toHaveBeenCalledWith(
      'desktop-lyrics:wheel',
      120
    );
  });

  it('dedups native and renderer scroll-list wheel input', () => {
    const controller = createController({
      platform: 'win32',
      store: disabledUnlockedStore(),
    });
    controller.setEnabled(true);
    controller.patchSettings({ wheelBehavior: 'scroll' });
    controller.window.webContents.send.mockClear();
    const [, handleNativeWheel] =
      controller.window.hookWindowMessage.mock.calls[0];
    const wParam = Buffer.alloc(4);
    wParam.writeInt16LE(120, 2);

    handleNativeWheel(wParam);
    controller.handleCommand({ type: 'wheelScroll', value: 120 });

    expect(controller.window.webContents.send).toHaveBeenCalledTimes(1);
    expect(controller.window.webContents.send).toHaveBeenCalledWith(
      'desktop-lyrics:wheel',
      120
    );
  });

  it('ignores a plain native wheel in the default classic mode', () => {
    const controller = createController({
      platform: 'win32',
      store: disabledUnlockedStore(),
    });
    controller.setEnabled(true);
    controller.window.webContents.send.mockClear();
    const [, handleNativeWheel] =
      controller.window.hookWindowMessage.mock.calls[0];
    const wParam = Buffer.alloc(4);
    wParam.writeInt16LE(120, 2);

    handleNativeWheel(wParam);

    expect(controller.window.webContents.send).not.toHaveBeenCalledWith(
      'desktop-lyrics:wheel',
      expect.anything()
    );
  });

  it('keeps Ctrl+wheel on background opacity without double adjustment', () => {
    const mainWindow = { webContents: { send: vi.fn() } };
    const controller = createController({
      platform: 'win32',
      mainWindow,
      store: disabledUnlockedStore(),
    });
    controller.setEnabled(true);
    mainWindow.webContents.send.mockClear();
    const [, handleNativeWheel] =
      controller.window.hookWindowMessage.mock.calls[0];
    const wParam = Buffer.alloc(4);
    // low word: MK_CONTROL; high word: wheel delta 120
    wParam.writeUInt32LE((120 << 16) | 0x0008, 0);

    handleNativeWheel(wParam);
    controller.handleCommand({
      type: 'adjustBackgroundOpacity',
      value: 120,
    });

    expect(controller.settings.backgroundOpacity).toBe(0.2);
    expect(mainWindow.webContents.send).not.toHaveBeenCalledWith(
      'mpris:command',
      expect.anything()
    );
  });

  it('forwards seek commands from the lyrics window to the main window', () => {
    const mainWindow = { webContents: { send: vi.fn() } };
    const controller = createController({
      mainWindow,
      store: disabledUnlockedStore(),
    });

    controller.handleCommand({ type: 'seekTo', value: 42.5 });
    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith(
      'setPosition',
      42.5
    );

    controller.handleCommand({ type: 'seek', value: -5 });
    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith(
      'mpris:command',
      { type: 'seek', offset: -5 }
    );

    controller.handleCommand({ type: 'seekTo', value: -1 });
    controller.handleCommand({ type: 'seekTo', value: 'NaN' });
    expect(mainWindow.webContents.send).toHaveBeenCalledTimes(2);
  });

  it('forwards the repeat-lyric-line command to the main window', () => {
    const mainWindow = { webContents: { send: vi.fn() } };
    const controller = createController({
      mainWindow,
      store: disabledUnlockedStore(),
    });

    controller.handleCommand({ type: 'repeatLyricLine' });

    expect(mainWindow.webContents.send).toHaveBeenLastCalledWith(
      'repeatLyricLine'
    );
  });

  it('passes the repeat lyric state through to the renderer', () => {
    const controller = createController({ store: disabledUnlockedStore() });

    controller.update({ repeatLyric: true });
    controller.setEnabled(true);

    expect(controller.window.webContents.send).toHaveBeenLastCalledWith(
      'desktop-lyrics:render',
      expect.objectContaining({ repeatLyric: true })
    );
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

  it('blocks native resize attempts for the frameless window', () => {
    const controller = createController();
    controller.setEnabled(true);
    const event = { preventDefault: vi.fn() };

    controller.window.emit('will-resize', event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('pins the page zoom so wheel or pinch gestures cannot enlarge lyrics', () => {
    const controller = createController();
    controller.setEnabled(true);

    expect(
      controller.window.webContents.setVisualZoomLevelLimits
    ).toHaveBeenCalledWith(1, 1);
    expect(controller.window.webContents.setZoomLevel).toHaveBeenCalledWith(0);
  });

  it('keeps the dragged window in place when lyric placement changes', () => {
    const controller = createController();
    controller.setEnabled(true);
    controller.window.setBounds.mockClear();

    controller.patchSettings({ verticalPosition: 'bottom' });

    expect(controller.settings.verticalPosition).toBe('bottom');
    expect(controller.window.setBounds).not.toHaveBeenCalled();
  });

  it('does not resize an existing window for echoed identical settings', () => {
    const controller = createController();
    controller.setEnabled(true);
    const initialBounds = controller.window.getBounds();
    controller.window.setBounds.mockClear();

    controller.applySettings({ ...controller.settings });

    expect(controller.window.setBounds).not.toHaveBeenCalled();
    expect(controller.window.getBounds()).toEqual(initialBounds);
  });

  it('restores a hidden desktop lyrics window to the default position', () => {
    const controller = createController();

    controller.resetPosition();

    expect(controller.settings).toMatchObject({
      enabled: true,
      visible: true,
      x: null,
      y: null,
    });
    expect(controller.window).not.toBeNull();
    expect(controller.window.showInactive).toHaveBeenCalled();
  });

  it('keeps a partially off-screen saved position instead of pulling it back', () => {
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
      x: -900,
      y: 760,
    });
  });

  it('recovers a fully off-screen saved position to the lower-middle default', () => {
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
      y: 428,
    });
  });

  it('saves partially off-screen placements but recovers fully hidden ones', () => {
    vi.useFakeTimers();
    try {
      const controller = createController();
      controller.setEnabled(true);
      controller.window.setBounds.mockClear();

      controller.window.bounds = {
        height: 120,
        width: 960,
        x: -900,
        y: 760,
      };
      controller.window.emit('move');
      vi.advanceTimersByTime(250);

      // still 50px visible: kept exactly as dropped
      expect(controller.window.setBounds).not.toHaveBeenCalled();
      expect(controller.settings).toMatchObject({ x: -900, y: 760 });

      controller.window.bounds = {
        height: 120,
        width: 960,
        x: -2000,
        y: 760,
      };
      controller.window.emit('move');
      vi.advanceTimersByTime(250);

      // completely outside every work area: back to the default placement
      expect(controller.window.setBounds).toHaveBeenCalledTimes(1);
      expect(controller.settings.x).not.toBe(-2000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('assembles paged lyric lists and keeps the active index in range', () => {
    const controller = createController();
    controller.updateLines({
      sequence: 1,
      index: 0,
      total: 2,
      lines: [
        { time: 0, content: 'one', translation: '' },
        { time: 3, content: 'two', translation: '二' },
      ],
    });
    // incomplete sequence: nothing replaces the rendered state yet
    expect(controller.currentLyrics.lines).toEqual([]);

    controller.updateLines({
      sequence: 1,
      index: 1,
      total: 2,
      lines: [{ time: 6, content: 'three', translation: '' }],
    });
    expect(controller.currentLyrics.lines).toEqual([
      { time: 0, content: 'one', translation: '' },
      { time: 3, content: 'two', translation: '二' },
      { time: 6, content: 'three', translation: '' },
    ]);

    // a newer sequence replaces the pending buffer entirely
    controller.updateLines({ sequence: 2, index: 0, total: 0, lines: [] });
    expect(controller.currentLyrics.lines).toEqual([]);
    expect(controller.currentLyrics.active).toBe(-1);

    controller.updateLines({
      sequence: 3,
      index: 0,
      total: 1,
      lines: [
        { time: 0, content: 'one', translation: '' },
        { time: 3, content: 'two', translation: '' },
      ],
    });
    controller.update({ line: 'two', active: 5 });
    expect(controller.currentLyrics.active).toBe(1);
    controller.update({ line: 'two', active: 0 });
    expect(controller.currentLyrics.active).toBe(0);
  });

  it('never resizes the window on its own when the line count changes', () => {
    const controller = createController();
    controller.setEnabled(true);
    const initialBounds = controller.window.getBounds();
    controller.window.setBounds.mockClear();

    controller.patchSettings({ lineCount: 3 });

    expect(controller.settings.lineCount).toBe(3);
    expect(controller.window.setBounds).not.toHaveBeenCalled();
    expect(controller.window.getBounds()).toEqual(initialBounds);
  });

  it('pins the window to all virtual desktops only when enabled on Windows', () => {
    const setWindowPinned = vi.fn();
    const controller = createController({
      platform: 'win32',
      setWindowPinned,
      store: disabledUnlockedStore(),
    });
    controller.setEnabled(true);
    controller.patchSettings({ allDesktops: true });

    expect(setWindowPinned).toHaveBeenLastCalledWith({
      hwnd: 4242,
      pinned: true,
    });

    controller.patchSettings({ allDesktops: false });
    expect(setWindowPinned).toHaveBeenLastCalledWith({
      hwnd: 4242,
      pinned: false,
    });
    expect(setWindowPinned).toHaveBeenCalledTimes(2);
  });

  it('does not repeat the pin call while the state is unchanged', () => {
    const setWindowPinned = vi.fn();
    const controller = createController({
      platform: 'win32',
      setWindowPinned,
      store: disabledUnlockedStore(),
    });
    controller.setEnabled(true);
    controller.patchSettings({ allDesktops: true });
    controller.applySettings({ ...controller.settings });
    controller.update({ line: 'still pinned' });

    expect(setWindowPinned).toHaveBeenCalledTimes(1);
  });

  it('ignores the all-desktops pin outside Windows', () => {
    const setWindowPinned = vi.fn();
    const controller = createController({
      platform: 'darwin',
      setWindowPinned,
      store: disabledUnlockedStore(),
    });
    controller.setEnabled(true);
    controller.patchSettings({ allDesktops: true });

    expect(setWindowPinned).not.toHaveBeenCalled();
  });
});

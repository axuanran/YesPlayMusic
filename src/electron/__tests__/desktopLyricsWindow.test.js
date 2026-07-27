import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { height: 1080, width: 1920, x: 0, y: 0 },
    }),
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
    this.setIgnoreMouseEvents = vi.fn();
    this.setVisibleOnAllWorkspaces = vi.fn();
    this.showInactive = vi.fn();
  }
}

const createController = () =>
  new DesktopLyricsWindow({
    WindowClass: MockWindow,
    getWorkArea: () => ({ height: 800, width: 1200, x: 10, y: 20 }),
    preloadPath: '/preload.js',
  });

describe('desktop lyrics window', () => {
  it('builds a sandboxed renderer that writes lyrics with textContent', () => {
    const html = buildDesktopLyricsHtml();

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("document.getElementById('line').textContent");
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
      { line: 'Line', translation: 'Translation' }
    );
    expect(win.showInactive).toHaveBeenCalledOnce();

    controller.setEnabled(false);
    expect(win.destroy).toHaveBeenCalledOnce();
    expect(controller.window).toBeNull();
  });
});

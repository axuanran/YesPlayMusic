import { describe, expect, it, vi } from 'vitest';
import { showMainWindow } from '../showMainWindow.js';

function createWindow({
  minimized = false,
  visible = true,
  destroyed = false,
  backgroundThrottling = true,
} = {}) {
  const webContents = {
    isDestroyed: vi.fn(() => false),
    invalidate: vi.fn(),
    getBackgroundThrottling: vi.fn(() => backgroundThrottling),
    setBackgroundThrottling: vi.fn(),
  };
  return {
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => minimized),
    isVisible: vi.fn(() => visible),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    webContents,
  };
}

describe('showMainWindow', () => {
  it('shows and focuses the main window', () => {
    const win = createWindow();

    showMainWindow(win);

    expect(win.restore).not.toHaveBeenCalled();
    expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
  });

  it('restores a minimized window before showing it', () => {
    const win = createWindow({ minimized: true });

    showMainWindow(win);

    expect(win.restore).toHaveBeenCalledOnce();
    expect(win.restore.mock.invocationCallOrder[0]).toBeLessThan(
      win.show.mock.invocationCallOrder[0]
    );
    expect(win.show.mock.invocationCallOrder[0]).toBeLessThan(
      win.focus.mock.invocationCallOrder[0]
    );
  });

  it('wakes and repaints a background renderer, then restores throttling', () => {
    vi.useFakeTimers();
    const win = createWindow({ visible: false });

    showMainWindow(win);

    expect(win.webContents.invalidate).toHaveBeenCalledOnce();
    expect(win.webContents.setBackgroundThrottling).toHaveBeenCalledWith(false);
    expect(win.webContents.setBackgroundThrottling).not.toHaveBeenCalledWith(
      true
    );

    vi.advanceTimersByTime(300);

    expect(win.webContents.setBackgroundThrottling).toHaveBeenLastCalledWith(
      true
    );
    vi.useRealTimers();
  });

  it('does not disturb throttling when the window is already visible', () => {
    const win = createWindow();

    showMainWindow(win);

    expect(win.webContents.invalidate).not.toHaveBeenCalled();
    expect(win.webContents.setBackgroundThrottling).not.toHaveBeenCalled();
  });

  it('extends the renderer wake period when shown repeatedly', () => {
    vi.useFakeTimers();
    const win = createWindow({ visible: false });

    showMainWindow(win);
    vi.advanceTimersByTime(200);
    showMainWindow(win);
    vi.advanceTimersByTime(200);

    expect(win.webContents.setBackgroundThrottling).not.toHaveBeenCalledWith(
      true
    );
    vi.advanceTimersByTime(100);
    expect(win.webContents.setBackgroundThrottling).toHaveBeenLastCalledWith(
      true
    );
    vi.useRealTimers();
  });

  it('ignores a destroyed window', () => {
    const win = createWindow({ destroyed: true });

    showMainWindow(win);

    expect(win.restore).not.toHaveBeenCalled();
    expect(win.show).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();
  });
});

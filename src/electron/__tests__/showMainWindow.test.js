import { describe, expect, it, vi } from 'vitest';
import { showMainWindow } from '../showMainWindow.js';

function createWindow({ minimized = false, destroyed = false } = {}) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => minimized),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
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

  it('ignores a destroyed window', () => {
    const win = createWindow({ destroyed: true });

    showMainWindow(win);

    expect(win.restore).not.toHaveBeenCalled();
    expect(win.show).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();
  });
});

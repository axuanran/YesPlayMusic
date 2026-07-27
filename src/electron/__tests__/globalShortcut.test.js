import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  globalShortcut: {
    register: vi.fn(() => true),
    unregisterAll: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  globalShortcut: mocks.globalShortcut,
}));

import defaultShortcuts, { normalizeShortcuts } from '@/utils/shortcuts';
import { registerGlobalShortcuts } from '@/electron/globalShortcut';

function createStore(settings = {}) {
  const values = {
    'settings.enableGlobalShortcut': true,
    'settings.shortcuts': normalizeShortcuts(defaultShortcuts),
    ...settings,
  };
  return {
    get: vi.fn(key => values[key]),
  };
}

function createWindow() {
  return {
    focus: vi.fn(),
    hide: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(),
    webContents: {
      send: vi.fn(),
    },
  };
}

describe('global shortcut registration', () => {
  beforeEach(() => {
    mocks.globalShortcut.register.mockClear();
    mocks.globalShortcut.register.mockReturnValue(true);
    mocks.globalShortcut.unregisterAll.mockClear();
  });

  it('registers enabled shortcuts from the normalized schema', () => {
    const win = createWindow();
    const results = registerGlobalShortcuts(win, createStore());
    const enabledGlobalCount = defaultShortcuts.filter(
      shortcut => shortcut.global.enabled
    ).length;

    expect(mocks.globalShortcut.unregisterAll).toHaveBeenCalledOnce();
    expect(results).toHaveLength(enabledGlobalCount);
    expect(mocks.globalShortcut.register).toHaveBeenCalledWith(
      'Alt+CommandOrControl+L',
      expect.any(Function)
    );

    const likeHandler = mocks.globalShortcut.register.mock.calls.find(
      ([accelerator]) => accelerator === 'Alt+CommandOrControl+L'
    )[1];
    likeHandler();
    expect(win.webContents.send).toHaveBeenCalledWith('like');
  });

  it('skips one disabled shortcut without affecting the others', () => {
    const shortcuts = normalizeShortcuts(defaultShortcuts);
    shortcuts.find(shortcut => shortcut.id === 'like').global.enabled = false;

    const results = registerGlobalShortcuts(
      createWindow(),
      createStore({ 'settings.shortcuts': shortcuts })
    );

    expect(results.map(result => result.id)).not.toContain('like');
    expect(results.map(result => result.id)).toContain('play');
  });

  it('registers nothing when the global master switch is disabled', () => {
    const results = registerGlobalShortcuts(
      createWindow(),
      createStore({ 'settings.enableGlobalShortcut': false })
    );

    expect(results).toEqual([]);
    expect(mocks.globalShortcut.register).not.toHaveBeenCalled();
    expect(mocks.globalShortcut.unregisterAll).toHaveBeenCalledOnce();
  });

  it('reports an unavailable accelerator without throwing', () => {
    mocks.globalShortcut.register.mockReturnValueOnce(false);

    const results = registerGlobalShortcuts(createWindow(), createStore());

    expect(results[0].registered).toBe(false);
    expect(results.slice(1).every(result => result.registered)).toBe(true);
  });
});

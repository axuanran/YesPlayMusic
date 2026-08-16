import { describe, expect, it } from 'vitest';
import defaultShortcuts, {
  getShortcut,
  normalizeShortcuts,
} from '../shortcuts.js';

describe('shortcut normalization', () => {
  it('provides enabled local and global bindings by default', () => {
    const shortcuts = normalizeShortcuts();
    const like = getShortcut(shortcuts, 'like');
    const desktopLyricsLock = getShortcut(
      shortcuts,
      'toggleDesktopLyricsLocked'
    );

    expect(shortcuts).toHaveLength(defaultShortcuts.length);
    expect(like).toMatchObject({
      global: {
        accelerator: 'Alt+CommandOrControl+L',
        enabled: true,
      },
      local: {
        accelerator: 'CommandOrControl+L',
        enabled: true,
      },
    });
    expect(desktopLyricsLock).toMatchObject({
      global: {
        accelerator: 'Alt+CommandOrControl+Shift+D',
        enabled: true,
      },
      local: {
        accelerator: 'CommandOrControl+Shift+D',
        enabled: true,
      },
    });
  });

  it('migrates legacy shortcut fields', () => {
    const like = getShortcut(
      normalizeShortcuts([
        {
          globalShortcut: 'Control+Shift+L',
          id: 'like',
          name: 'Like',
          shortcut: 'Control+L',
        },
      ]),
      'like'
    );

    expect(like).toEqual({
      global: {
        accelerator: 'Control+Shift+L',
        enabled: true,
      },
      id: 'like',
      local: {
        accelerator: 'Control+L',
        enabled: true,
      },
      name: 'Like',
    });
  });

  it('preserves individual disabled states and fills missing actions', () => {
    const shortcuts = normalizeShortcuts([
      {
        global: {
          accelerator: 'Alt+CommandOrControl+L',
          enabled: false,
        },
        id: 'like',
      },
    ]);

    expect(getShortcut(shortcuts, 'like').global.enabled).toBe(false);
    expect(getShortcut(shortcuts, 'play')).toBeDefined();
  });

  it('returns fresh bindings instead of shared defaults', () => {
    const first = normalizeShortcuts();
    first[0].global.enabled = false;

    expect(normalizeShortcuts()[0].global.enabled).toBe(true);
  });
});

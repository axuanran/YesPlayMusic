import { describe, expect, it, vi } from 'vitest';
import {
  getPluginEnabled,
  getPluginSettings,
  getSetting,
  setPluginEnabled,
  setSetting,
} from '../settings';

describe('plugin settings', () => {
  it('reads settings with fallback', () => {
    const store = { state: { settings: { theme: 'dark' } } };

    expect(getSetting(store, 'theme', 'light')).toBe('dark');
    expect(getSetting(store, 'missing', 'fallback')).toBe('fallback');
  });

  it('writes settings through store mutation', () => {
    const commit = vi.fn();

    setSetting({ commit }, 'theme', 'dark');

    expect(commit).toHaveBeenCalledWith('updateSettings', {
      key: 'theme',
      value: 'dark',
    });
  });

  it('reads plugin settings and default enabled state', () => {
    expect(
      getPluginSettings({ plugins: { demo: { enabled: false } } })
    ).toEqual({ demo: { enabled: false } });
    expect(getPluginEnabled({ id: 'demo', enabledByDefault: true }, {})).toBe(
      true
    );
  });

  it('sets plugin enabled state without dropping existing state', () => {
    const commit = vi.fn();
    const store = {
      state: {
        settings: {
          plugins: {
            demo: { enabled: false, custom: 1 },
          },
        },
      },
      commit,
    };

    const plugins = setPluginEnabled(store, 'demo', true);

    expect(plugins.demo).toEqual({ enabled: true, custom: 1 });
    expect(commit).toHaveBeenCalledWith('updateSettings', {
      key: 'plugins',
      value: plugins,
    });
  });
});

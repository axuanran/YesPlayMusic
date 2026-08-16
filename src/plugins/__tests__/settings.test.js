import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPluginSettingLinks,
  getPluginEnabled,
  getPluginSettings,
  getSetting,
  setPluginEnabled,
  setSetting,
} from '../settings';

describe('plugin settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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

  it('reads plugin settings from localStorage fallback', () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ plugins: { demo: { enabled: true } } })
    );

    expect(getPluginSettings()).toEqual({ demo: { enabled: true } });
  });

  it('handles invalid localStorage settings', () => {
    localStorage.setItem('settings', '{bad-json');

    expect(getPluginSettings()).toEqual({});
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

  it('turns off audio resolver when Resolver Admin is disabled', () => {
    const commit = vi.fn();
    const store = {
      state: {
        settings: {
          useAudioResolver: true,
          plugins: {},
        },
      },
      commit,
    };

    setPluginEnabled(store, 'resolver-admin', false);

    expect(commit).toHaveBeenNthCalledWith(1, 'updateSettings', {
      key: 'useAudioResolver',
      value: false,
    });
    expect(commit).toHaveBeenNthCalledWith(2, 'updateSettings', {
      key: 'plugins',
      value: {
        'resolver-admin': { enabled: false },
      },
    });
  });

  it('keeps a disabled Resolver Admin linked during settings migration', () => {
    expect(
      applyPluginSettingLinks({
        useAudioResolver: true,
        plugins: {
          'resolver-admin': { enabled: false },
        },
      })
    ).toMatchObject({
      useAudioResolver: false,
    });
  });

  it('does not force audio resolver on when Resolver Admin is enabled', () => {
    expect(
      applyPluginSettingLinks({
        useAudioResolver: false,
        plugins: {
          'resolver-admin': { enabled: true },
        },
      })
    ).toMatchObject({
      useAudioResolver: false,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disposePlugin,
  getInstalledPlugins,
  installPlugin,
  installPlugins,
  resetPluginRuntimeForTest,
  syncPlugins,
} from '../runtime';

describe('plugin runtime', () => {
  beforeEach(() => {
    resetPluginRuntimeForTest();
  });

  it('installs plugins and runs setup once', () => {
    const setup = vi.fn();
    const plugin = { id: 'demo', setup };

    installPlugin(plugin, { value: 1 });
    installPlugin(plugin, { value: 2 });

    expect(setup).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledWith({ value: 1 });
    expect(getInstalledPlugins()).toHaveLength(1);
  });

  it('disposes cleanup functions', () => {
    const cleanup = vi.fn();
    installPlugin({ id: 'demo', setup: () => cleanup });

    disposePlugin('demo');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(getInstalledPlugins()).toHaveLength(0);
  });

  it('sync removes disabled plugins and installs enabled plugins', () => {
    const cleanupA = vi.fn();
    installPlugins([{ id: 'a', setup: () => cleanupA }]);

    syncPlugins([{ id: 'b', setup: vi.fn() }]);

    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(getInstalledPlugins().map(item => item.plugin.id)).toEqual(['b']);
  });

  it('keeps running when setup throws', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const goodSetup = vi.fn();

    installPlugins([
      {
        id: 'bad',
        setup: () => {
          throw new Error('boom');
        },
      },
      { id: 'good', setup: goodSetup },
    ]);

    expect(goodSetup).toHaveBeenCalledTimes(1);
    expect(getInstalledPlugins().map(item => item.plugin.id)).toEqual(['good']);
  });
});

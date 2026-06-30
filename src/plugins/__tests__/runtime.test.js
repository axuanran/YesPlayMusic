import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPluginRuntime } from '../runtime';

describe('plugin runtime', () => {
  let runtime;

  beforeEach(() => {
    runtime = createPluginRuntime();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  it('installs plugins and runs setup once', () => {
    const setup = vi.fn();
    const plugin = { id: 'demo', setup };

    runtime.installPlugin(plugin, { value: 1 });
    runtime.installPlugin(plugin, { value: 2 });

    expect(setup).toHaveBeenCalledTimes(1);
    expect(setup).toHaveBeenCalledWith({ value: 1 });
    expect(runtime.getInstalledPlugins()).toHaveLength(1);
    expect(runtime.getPluginHealth('demo')).toMatchObject({
      installedAt: 1000,
    });
  });

  it('disposes cleanup functions', () => {
    const cleanup = vi.fn();
    runtime.installPlugin({ id: 'demo', setup: () => cleanup });

    runtime.disposePlugin('demo');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(runtime.getInstalledPlugins()).toHaveLength(0);
    expect(runtime.getPluginHealth('demo')).toMatchObject({
      disposedAt: 1000,
    });
  });

  it('sync removes disabled plugins and installs enabled plugins', () => {
    const cleanupA = vi.fn();
    runtime.installPlugins([{ id: 'a', setup: () => cleanupA }]);

    runtime.syncPlugins([{ id: 'b', setup: vi.fn() }]);

    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(runtime.getInstalledPlugins().map(item => item.plugin.id)).toEqual([
      'b',
    ]);
  });

  it('keeps running when setup throws', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const goodSetup = vi.fn();

    runtime.installPlugins([
      {
        id: 'bad',
        setup: () => {
          throw new Error('boom');
        },
      },
      { id: 'good', setup: goodSetup },
    ]);

    expect(goodSetup).toHaveBeenCalledTimes(1);
    expect(runtime.getInstalledPlugins().map(item => item.plugin.id)).toEqual([
      'good',
    ]);
    expect(runtime.getPluginHealth('bad')).toMatchObject({
      setupError: 'boom',
      setupErrorAt: 1000,
    });
  });

  it('stores dispose errors without throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    runtime.installPlugin({
      id: 'bad-cleanup',
      setup: () => {
        return () => {
          throw new Error('cleanup failed');
        };
      },
    });

    expect(() => runtime.disposePlugin('bad-cleanup')).not.toThrow();
    expect(runtime.getPluginHealth('bad-cleanup')).toMatchObject({
      disposeError: 'cleanup failed',
      disposeErrorAt: 1000,
    });
  });
});

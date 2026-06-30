import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/store', () => ({
  default: {
    state: {
      settings: {
        musicQuality: 'lossless',
      },
    },
  },
}));

vi.mock('@/plugins/events', () => ({
  pluginEvents: {
    emit: vi.fn(),
  },
}));

vi.mock('@/plugins/logger', () => ({
  createPluginLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { createAudioProviderRegistry } from '../registry';

describe('audio provider registry', () => {
  let registry;

  beforeEach(() => {
    registry = createAudioProviderRegistry({
      getQuality: () => 'lossless',
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      providerStore: { state: { settings: { musicQuality: 'lossless' } } },
      events: { emit: vi.fn() },
    });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sorts providers by priority', () => {
    registry.registerAudioProvider({
      id: 'low',
      priority: 10,
      resolve: vi.fn(),
    });
    registry.registerAudioProvider({
      id: 'high',
      priority: 20,
      resolve: vi.fn(),
    });

    expect(registry.getAudioProviders().map(provider => provider.id)).toEqual([
      'high',
      'low',
    ]);
  });

  it('resolves string results and stores success status', async () => {
    registry.registerAudioProvider({
      id: 'demo',
      resolve: vi.fn().mockResolvedValue('https://example.test/a.mp3'),
    });

    await expect(
      registry.resolveTrackSourceWithProviders(1, 'standard')
    ).resolves.toBe('https://example.test/a.mp3');
    expect(registry.getAudioProviderStatus()[0]).toMatchObject({
      id: 'demo',
      lastSuccessAt: 1000,
    });
  });

  it('resolves object results', async () => {
    registry.registerAudioProvider({
      id: 'demo',
      resolve: vi.fn().mockResolvedValue({
        ok: true,
        playUrl: 'https://example.test/b.mp3',
        quality: 'hires',
      }),
    });

    await expect(
      registry.resolveTrackSourceWithProviders(1, 'hires')
    ).resolves.toBe('https://example.test/b.mp3');
  });

  it('caches successful results by track and quality', async () => {
    const resolve = vi.fn().mockResolvedValue('https://example.test/c.mp3');
    registry.registerAudioProvider({
      id: 'demo',
      resolve,
    });

    await expect(
      registry.resolveTrackSourceWithProviders(1, 'standard')
    ).resolves.toBe('https://example.test/c.mp3');
    await expect(
      registry.resolveTrackSourceWithProviders(1, 'standard')
    ).resolves.toBe('https://example.test/c.mp3');

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('expires cached successful results', async () => {
    registry = createAudioProviderRegistry({
      getQuality: () => 'lossless',
      logger: {
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      providerStore: { state: { settings: { musicQuality: 'lossless' } } },
      events: { emit: vi.fn() },
      cacheTtl: 100,
    });
    const resolve = vi
      .fn()
      .mockResolvedValueOnce('https://example.test/first.mp3')
      .mockResolvedValueOnce('https://example.test/second.mp3');
    registry.registerAudioProvider({
      id: 'demo',
      resolve,
    });

    vi.mocked(Date.now).mockReturnValue(1000);
    await expect(
      registry.resolveTrackSourceWithProviders(1, 'standard')
    ).resolves.toBe('https://example.test/first.mp3');
    vi.mocked(Date.now).mockReturnValue(1200);
    await expect(
      registry.resolveTrackSourceWithProviders(1, 'standard')
    ).resolves.toBe('https://example.test/second.mp3');

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('falls back after provider errors and stores error status', async () => {
    registry.registerAudioProvider({
      id: 'bad',
      priority: 20,
      resolve: vi.fn().mockRejectedValue(new Error('boom')),
    });
    registry.registerAudioProvider({
      id: 'good',
      priority: 10,
      resolve: vi.fn().mockResolvedValue('https://example.test/good.mp3'),
    });

    await expect(registry.resolveTrackSourceWithProviders(1)).resolves.toBe(
      'https://example.test/good.mp3'
    );
    expect(registry.getAudioProviderStatus()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'bad',
          lastError: 'boom',
          lastErrorAt: 1000,
        }),
        expect.objectContaining({
          id: 'good',
          lastSuccessAt: 1000,
        }),
      ])
    );
  });
});

import { describe, expect, it, vi } from 'vitest';

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

function createRegistry(now) {
  return createAudioProviderRegistry({
    getQuality: () => 'standard',
    logger: {
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    providerStore: { state: { settings: { musicQuality: 'standard' } } },
    events: { emit: vi.fn() },
    cacheTtl: 1000,
    now,
  });
}

describe('audio provider cache TTL overrides', () => {
  it('expires a source using the provider-specific TTL', async () => {
    let now = 1000;
    const registry = createRegistry(() => now);
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({
        playUrl: 'https://example.test/first.mp3',
        cacheTtlMs: 100,
      })
      .mockResolvedValueOnce({
        playUrl: 'https://example.test/second.mp3',
        cacheTtlMs: 100,
      });
    registry.registerAudioProvider({ id: 'demo', resolve });

    await expect(
      registry.resolveTrackSourceWithProviders(1, 'standard')
    ).resolves.toBe('https://example.test/first.mp3');
    now = 1050;
    await expect(
      registry.resolveTrackSourceWithProviders(1, 'standard')
    ).resolves.toBe('https://example.test/first.mp3');
    now = 1101;
    await expect(
      registry.resolveTrackSourceWithProviders(1, 'standard')
    ).resolves.toBe('https://example.test/second.mp3');

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('disables cache writes when a provider returns cacheTtlMs 0', async () => {
    let now = 1000;
    const registry = createRegistry(() => now);
    const resolve = vi
      .fn()
      .mockResolvedValueOnce({
        playUrl: 'https://example.test/first.mp3',
        cacheTtlMs: 0,
      })
      .mockResolvedValueOnce({
        playUrl: 'https://example.test/second.mp3',
        cacheTtlMs: 0,
      });
    registry.registerAudioProvider({ id: 'demo', resolve });

    await expect(
      registry.resolveTrackSourceWithProviders(2, 'standard')
    ).resolves.toBe('https://example.test/first.mp3');
    now = 1001;
    await expect(
      registry.resolveTrackSourceWithProviders(2, 'standard')
    ).resolves.toBe('https://example.test/second.mp3');

    expect(resolve).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import {
  getAudioProviderStatus,
  getAudioProviders,
  registerAudioProvider,
  resetAudioProvidersForTest,
  resolveTrackSourceWithProviders,
} from '../registry';

describe('audio provider registry', () => {
  beforeEach(() => {
    resetAudioProvidersForTest();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  it('sorts providers by priority', () => {
    registerAudioProvider({ id: 'low', priority: 10, resolve: vi.fn() });
    registerAudioProvider({ id: 'high', priority: 20, resolve: vi.fn() });

    expect(getAudioProviders().map(provider => provider.id)).toEqual([
      'high',
      'low',
    ]);
  });

  it('resolves string results and stores success status', async () => {
    registerAudioProvider({
      id: 'demo',
      resolve: vi.fn().mockResolvedValue('https://example.test/a.mp3'),
    });

    await expect(resolveTrackSourceWithProviders(1, 'standard')).resolves.toBe(
      'https://example.test/a.mp3'
    );
    expect(getAudioProviderStatus()[0]).toMatchObject({
      id: 'demo',
      lastSuccessAt: 1000,
    });
  });

  it('resolves object results', async () => {
    registerAudioProvider({
      id: 'demo',
      resolve: vi.fn().mockResolvedValue({
        ok: true,
        playUrl: 'https://example.test/b.mp3',
        quality: 'hires',
      }),
    });

    await expect(resolveTrackSourceWithProviders(1, 'hires')).resolves.toBe(
      'https://example.test/b.mp3'
    );
  });

  it('falls back after provider errors and stores error status', async () => {
    registerAudioProvider({
      id: 'bad',
      priority: 20,
      resolve: vi.fn().mockRejectedValue(new Error('boom')),
    });
    registerAudioProvider({
      id: 'good',
      priority: 10,
      resolve: vi.fn().mockResolvedValue('https://example.test/good.mp3'),
    });

    await expect(resolveTrackSourceWithProviders(1)).resolves.toBe(
      'https://example.test/good.mp3'
    );
    expect(getAudioProviderStatus()).toEqual(
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

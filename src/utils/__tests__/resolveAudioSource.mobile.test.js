import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: null,
  getMP3: vi.fn(),
  isAccountLoggedIn: vi.fn(),
  isResolverEnabled: vi.fn(),
  resolveTrackSourceWithProviders: vi.fn(),
}));

vi.mock('@/api/track', () => ({
  getMP3: mocks.getMP3,
}));

vi.mock('@/api/audioResolver', () => ({
  getEmbeddedResolverConfig: () => mocks.config,
  isResolverEnabled: mocks.isResolverEnabled,
}));

vi.mock('@/utils/auth', () => ({
  isAccountLoggedIn: mocks.isAccountLoggedIn,
}));

vi.mock('@/utils/env', () => ({
  isCapacitor: true,
}));

vi.mock('@/plugins/providers/audio', () => ({
  resolveTrackSourceWithProviders: mocks.resolveTrackSourceWithProviders,
}));

import { resolveTrackSource } from '../resolveAudioSource';

describe('Android resolver legacy fallback control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config = {
      audio: {
        fallbackToLegacy: true,
      },
    };
    mocks.isResolverEnabled.mockReturnValue(true);
    mocks.isAccountLoggedIn.mockReturnValue(true);
    mocks.resolveTrackSourceWithProviders.mockResolvedValue(null);
  });

  it('stops after the embedded provider when legacy fallback is disabled', async () => {
    mocks.config.audio.fallbackToLegacy = false;

    await expect(resolveTrackSource({ id: 123 })).resolves.toBeNull();
    expect(mocks.getMP3).not.toHaveBeenCalled();
  });

  it('keeps the legacy chain available when the embedded resolver is disabled', async () => {
    mocks.config.audio.fallbackToLegacy = false;
    mocks.isResolverEnabled.mockReturnValue(false);
    mocks.getMP3.mockResolvedValue({
      data: [
        {
          url: 'http://m801.music.126.net/legacy.mp3',
          freeTrialInfo: null,
        },
      ],
    });

    await expect(resolveTrackSource({ id: 456 })).resolves.toBe(
      'https://m801.music.126.net/legacy.mp3'
    );
    expect(mocks.getMP3).toHaveBeenCalledTimes(1);
  });
});

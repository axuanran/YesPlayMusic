import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: null,
  getMP3: vi.fn(),
  isAccountLoggedIn: vi.fn(),
  registerAudioProvider: vi.fn(),
}));

vi.mock('@/api/track', () => ({
  getMP3: mocks.getMP3,
}));

vi.mock('@/api/audioResolver', () => ({
  getEmbeddedResolverConfig: () => mocks.config,
  isResolverEnabled: () => true,
  resolveAudioByBackend: vi.fn(),
}));

vi.mock('@/utils/auth', () => ({
  isAccountLoggedIn: mocks.isAccountLoggedIn,
}));

vi.mock('@/utils/env', () => ({
  isCapacitor: true,
}));

vi.mock('@/plugins/providers/audio/registry', () => ({
  registerAudioProvider: mocks.registerAudioProvider,
}));

import { registerResolverAudioProvider } from '../resolverProvider';

function registeredProvider() {
  registerResolverAudioProvider();
  return mocks.registerAudioProvider.mock.calls.at(-1)[0];
}

describe('Android resolver provider controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config = {
      audio: {
        cacheTtl: 120,
        fallbackToLegacy: true,
        mobile: {
          neteaseEnabled: true,
          outerUrlFallback: true,
        },
      },
    };
    mocks.isAccountLoggedIn.mockReturnValue(false);
    mocks.registerAudioProvider.mockReturnValue(vi.fn());
  });

  it('returns the Android NetEase direct URL with the configured cache TTL', async () => {
    mocks.getMP3.mockResolvedValue({
      data: [
        {
          url: 'http://m801.music.126.net/example.mp3',
          freeTrialInfo: null,
          level: 'exhigh',
          br: 320000,
          size: 1234,
        },
      ],
    });

    const provider = registeredProvider();
    await expect(provider.resolve(123, 'exhigh', {})).resolves.toMatchObject({
      playUrl: 'https://m801.music.126.net/example.mp3',
      quality: 'exhigh',
      cacheTtlMs: 120000,
      meta: {
        source: 'netease',
      },
    });
  });

  it('skips NetEase direct resolution when that mobile control is disabled', async () => {
    mocks.config.audio.mobile.neteaseEnabled = false;

    const provider = registeredProvider();
    await expect(provider.resolve(456, 'standard', {})).resolves.toMatchObject({
      playUrl: 'https://music.163.com/song/media/outer/url?id=456',
      meta: {
        source: 'netease-outer',
      },
    });
    expect(mocks.getMP3).not.toHaveBeenCalled();
  });

  it('falls back to Outer URL for logged-out users when direct resolution errors', async () => {
    mocks.getMP3.mockRejectedValue(new Error('network failed'));

    const provider = registeredProvider();
    await expect(provider.resolve(789, 'standard', {})).resolves.toMatchObject({
      playUrl: 'https://music.163.com/song/media/outer/url?id=789',
      meta: {
        source: 'netease-outer',
        directError: 'network failed',
      },
    });
  });

  it('returns no source when both Android source strategies are disabled', async () => {
    mocks.config.audio.mobile.neteaseEnabled = false;
    mocks.config.audio.mobile.outerUrlFallback = false;

    const provider = registeredProvider();
    await expect(provider.resolve(1000, 'standard', {})).resolves.toBeNull();
    expect(mocks.getMP3).not.toHaveBeenCalled();
  });

  it('does not hide an aborted direct request behind the Outer URL fallback', async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new Error('aborted');
    mocks.getMP3.mockRejectedValue(error);

    const provider = registeredProvider();
    await expect(
      provider.resolve(1001, 'standard', { signal: controller.signal })
    ).rejects.toBe(error);
  });
});

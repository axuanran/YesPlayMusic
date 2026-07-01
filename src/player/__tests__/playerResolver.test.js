import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMP3: vi.fn(),
  getTrackDetail: vi.fn(),
  isAccountLoggedIn: vi.fn(),
  cacheTrackSource: vi.fn(),
  getTrackSource: vi.fn(),
  getOuterAudioUrl: vi.fn(),
  resolveTrackSource: vi.fn(),
}));

vi.mock('@/api/track', () => ({
  getMP3: mocks.getMP3,
  getTrackDetail: mocks.getTrackDetail,
}));

vi.mock('@/utils/auth', () => ({
  isAccountLoggedIn: mocks.isAccountLoggedIn,
}));

vi.mock('@/utils/db', () => ({
  cacheTrackSource: mocks.cacheTrackSource,
  getTrackSource: mocks.getTrackSource,
}));

vi.mock('@/utils/resolveAudioSource', () => ({
  getOuterAudioUrl: mocks.getOuterAudioUrl,
  resolveTrackSource: mocks.resolveTrackSource,
}));

import PlayerResolver, { isCanceledRequest } from '../playerResolver';

describe('PlayerResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOuterAudioUrl.mockImplementation(id => `outer:${id}`);
    globalThis.yesplaymusicStore = {
      state: {
        settings: {
          automaticallyCacheSongs: true,
        },
      },
    };
  });

  it('loads a single track detail', async () => {
    const track = { id: 1, name: 'demo' };
    mocks.getTrackDetail.mockResolvedValue({ songs: [track] });
    const resolver = new PlayerResolver();

    await expect(resolver.loadTrack(1)).resolves.toBe(track);
  });

  it('uses provider source before legacy fallback', async () => {
    mocks.resolveTrackSource.mockResolvedValue('provider-url');
    const resolver = new PlayerResolver();

    await expect(resolver.resolveSource({ id: 1 })).resolves.toBe(
      'provider-url'
    );
    expect(mocks.getMP3).not.toHaveBeenCalled();
  });

  it('falls back to legacy source when provider fails', async () => {
    mocks.resolveTrackSource.mockRejectedValue(new Error('provider failed'));
    mocks.getTrackSource.mockResolvedValue(null);
    mocks.isAccountLoggedIn.mockReturnValue(false);
    const resolver = new PlayerResolver();

    await expect(resolver.resolveSource({ id: 2 })).resolves.toBe('outer:2');
  });

  it('does not fall back when a request is canceled', async () => {
    const error = new Error('canceled');
    error.code = 'ERR_CANCELED';
    mocks.resolveTrackSource.mockRejectedValue(error);
    const resolver = new PlayerResolver();

    await expect(resolver.resolveSource({ id: 3 })).rejects.toBe(error);
  });

  it('detects axios cancellation errors', () => {
    expect(isCanceledRequest({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isCanceledRequest({ name: 'CanceledError' })).toBe(true);
    expect(isCanceledRequest(new Error('boom'))).toBe(false);
  });
});

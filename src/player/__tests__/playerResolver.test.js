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
    mocks.getTrackSource.mockResolvedValue(null);
    mocks.cacheTrackSource.mockResolvedValue({});
    globalThis.yesplaymusicStore = {
      state: {
        settings: {
          automaticallyCacheSongs: true,
        },
      },
    };
    globalThis.window = { electronAPI: undefined };
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

  it('uses a cached source before requesting a provider', async () => {
    const source = new ArrayBuffer(8);
    mocks.getTrackSource.mockResolvedValue({ source });
    const createBlobUrl = vi.fn(() => 'blob:cached');
    const resolver = new PlayerResolver({ createBlobUrl });

    await expect(resolver.resolveSource({ id: 1 })).resolves.toBe(
      'blob:cached'
    );
    expect(createBlobUrl).toHaveBeenCalledWith(source);
    expect(mocks.resolveTrackSource).not.toHaveBeenCalled();
  });

  it('caches a successful provider source in the background', async () => {
    const track = { id: 10, name: 'demo', ar: [], al: {} };
    mocks.resolveTrackSource.mockResolvedValue(
      'https://example.test/audio.mp3'
    );
    const resolver = new PlayerResolver();

    await expect(resolver.resolveSource(track)).resolves.toBe(
      'https://example.test/audio.mp3'
    );
    await vi.waitFor(() => {
      expect(mocks.cacheTrackSource).toHaveBeenCalledWith(
        track,
        'https://example.test/audio.mp3',
        undefined,
        'resolver'
      );
    });
  });

  it('does not cache when automatic caching is disabled', async () => {
    globalThis.yesplaymusicStore.state.settings.automaticallyCacheSongs = false;
    mocks.resolveTrackSource.mockResolvedValue(
      'https://example.test/audio.mp3'
    );
    const resolver = new PlayerResolver();

    await resolver.resolveSource({ id: 11 });
    expect(mocks.cacheTrackSource).not.toHaveBeenCalled();
  });

  it('loads local tracks and returns their source without network requests', async () => {
    const track = {
      id: 'local:track',
      local: true,
      sourceUrl: 'http://127.0.0.1:3210/local-music/local%3Atrack/audio',
    };
    window.electronAPI = {
      localMusic: {
        get: vi.fn().mockResolvedValue(track),
      },
    };
    const resolver = new PlayerResolver();

    await expect(resolver.loadTrack(track.id)).resolves.toBe(track);
    await expect(resolver.resolveSource(track)).resolves.toBe(track.sourceUrl);
    expect(mocks.getTrackDetail).not.toHaveBeenCalled();
    expect(mocks.resolveTrackSource).not.toHaveBeenCalled();
  });

  it('loads streaming tracks without exposing provider requests', async () => {
    const track = {
      id: 'stream:connection:item',
      streaming: true,
      sourceUrl: 'http://127.0.0.1:3210/streaming/connection/items/item/audio',
    };
    window.electronAPI = {
      streaming: {
        getTrack: vi.fn().mockResolvedValue(track),
      },
    };
    const resolver = new PlayerResolver();

    await expect(resolver.loadTrack(track.id)).resolves.toBe(track);
    await expect(resolver.resolveSource(track)).resolves.toBe(track.sourceUrl);
    expect(mocks.getTrackDetail).not.toHaveBeenCalled();
    expect(mocks.resolveTrackSource).not.toHaveBeenCalled();
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

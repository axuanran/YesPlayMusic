import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolverClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mocks.resolverClient),
  },
}));

import {
  getCurrentPageResolverURL,
  getResolverConfig,
  resolveAudioByBackend,
  syncCookieToResolver,
  syncCookieToResolverWithRetry,
} from '../audioResolver.js';

const { resolverClient } = mocks;

describe('bundled audio resolver API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('does not expose cookies while audio resolution is disabled', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ useAudioResolver: false })
    );

    await expect(syncCookieToResolver('MUSIC_U=value')).resolves.toBe(false);
    expect(resolverClient.post).not.toHaveBeenCalled();
  });

  it('uses the bundled same-origin resolver without a configurable URL', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ useAudioResolver: true })
    );
    resolverClient.get.mockResolvedValueOnce({
      data: { ok: true, hasCookie: false },
    });
    resolverClient.post.mockResolvedValueOnce({
      data: { ok: true },
    });

    await expect(syncCookieToResolverWithRetry('MUSIC_U=value')).resolves.toBe(
      true
    );

    expect(getCurrentPageResolverURL()).toBe('/resolver-api');
    expect(resolverClient.post).toHaveBeenCalledWith('/api/admin/cookie', {
      cookie: 'MUSIC_U=value',
    });
  });

  it('loads the real resolver configuration from the bundled admin API', async () => {
    const config = {
      audio: {
        providerOrder: ['netease', 'unblock', 'fallback'],
      },
    };
    resolverClient.get.mockResolvedValueOnce({
      data: { ok: true, config },
    });

    await expect(getResolverConfig()).resolves.toEqual({ ok: true, config });
    expect(resolverClient.get).toHaveBeenCalledWith('/api/admin/config');
  });

  it('prefixes resolver stream URLs with the bundled resolver route', async () => {
    resolverClient.post.mockResolvedValueOnce({
      data: {
        ok: true,
        trackId: 123,
        playUrl: '/api/audio/stream/token',
        mode: 'proxy',
        source: 'unblock:kugou',
        provider: 'unblock',
        quality: 'exhigh',
      },
    });

    const result = await resolveAudioByBackend(123, 'exhigh');

    expect(result.playUrl).toBe('/resolver-api/api/audio/stream/token');
    expect(resolverClient.post).toHaveBeenCalledWith(
      '/api/audio/resolve',
      {
        trackId: 123,
        quality: 'exhigh',
        bypassCache: false,
        track: undefined,
      },
      { signal: undefined }
    );
  });
});

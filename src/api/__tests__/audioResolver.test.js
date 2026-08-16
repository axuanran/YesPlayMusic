import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
  },
  create: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: mocks.create,
  },
}));

import {
  getCurrentPageResolverURL,
  syncCookieToResolver,
  syncCookieToResolverWithRetry,
} from '../audioResolver.js';

describe('audio resolver cookie sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    globalThis.window = {
      location: {
        hostname: '127.0.0.1',
        origin: 'http://127.0.0.1:31000',
      },
    };
    mocks.create.mockImplementation(config => {
      mocks.client.defaults = { baseURL: config.baseURL };
      return mocks.client;
    });
    mocks.client.get.mockResolvedValue({ data: { ok: true } });
    mocks.client.post.mockResolvedValue({ data: { ok: true } });
  });

  it('does not contact the resolver while audio resolution is disabled', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ useAudioResolver: false })
    );

    await expect(syncCookieToResolver('MUSIC_U=value')).resolves.toBe(false);

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.client.post).not.toHaveBeenCalled();
  });

  it('syncs a cookie through the current same-origin resolver path', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ useAudioResolver: true })
    );

    await expect(syncCookieToResolverWithRetry('MUSIC_U=value')).resolves.toBe(
      true
    );

    expect(getCurrentPageResolverURL()).toBe(
      'http://127.0.0.1:31000/resolver-api'
    );
    expect(mocks.create).toHaveBeenCalledWith({
      baseURL: '/resolver-api',
      timeout: 15000,
    });
    expect(mocks.client.get).toHaveBeenCalledWith('/api/admin/cookie');
    expect(mocks.client.post).toHaveBeenCalledWith('/api/admin/cookie', {
      cookie: 'MUSIC_U=value',
    });
  });
});

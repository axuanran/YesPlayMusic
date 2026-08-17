import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCurrentPageResolverURL,
  syncCookieToResolver,
  syncCookieToResolverWithRetry,
} from '../audioResolver.js';

describe('embedded audio resolver compatibility API', () => {
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
  });

  it('uses the in-process resolver without a network endpoint', async () => {
    localStorage.setItem(
      'settings',
      JSON.stringify({ useAudioResolver: true })
    );

    await expect(syncCookieToResolverWithRetry('MUSIC_U=value')).resolves.toBe(
      true
    );

    expect(getCurrentPageResolverURL()).toBe('embedded://audio-resolver');
  });
});

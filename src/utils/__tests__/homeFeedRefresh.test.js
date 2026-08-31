import { describe, expect, it } from 'vitest';

import {
  HOME_FEED_REFRESH_INTERVAL,
  sampleHomeArtists,
  shouldRefreshHomeFeed,
} from '../homeFeedRefresh';

describe('home feed refresh policy', () => {
  it('reuses a fresh feed for the same account and language', () => {
    expect(
      shouldRefreshHomeFeed({
        feedKey: 'all:guest',
        loadedAt: 1000,
        loadedFeedKey: 'all:guest',
        now: 1000 + HOME_FEED_REFRESH_INTERVAL - 1,
      })
    ).toBe(false);
  });

  it('refreshes stale, forced, or account-specific feeds', () => {
    const base = {
      feedKey: 'all:42',
      loadedAt: 1000,
      loadedFeedKey: 'all:guest',
      now: 1001,
    };

    expect(shouldRefreshHomeFeed(base)).toBe(true);
    expect(
      shouldRefreshHomeFeed({
        ...base,
        loadedFeedKey: base.feedKey,
        now: 1000 + HOME_FEED_REFRESH_INTERVAL,
      })
    ).toBe(true);
    expect(
      shouldRefreshHomeFeed({
        ...base,
        force: true,
        loadedFeedKey: base.feedKey,
      })
    ).toBe(true);
  });

  it('samples only available artists without mutating the response', () => {
    const artists = [{ id: 1 }, { id: 2 }, { id: 3 }];

    const sampled = sampleHomeArtists(artists, 6, () => 0);

    expect(sampled).toHaveLength(3);
    expect(sampled.map(artist => artist.id).sort()).toEqual([1, 2, 3]);
    expect(artists.map(artist => artist.id)).toEqual([1, 2, 3]);
  });
});

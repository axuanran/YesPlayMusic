import { describe, expect, it } from 'vitest';
import { getWritableUserPlaylists } from '../userPlaylists.js';

describe('writable user playlists', () => {
  it('matches creator IDs across string and number representations', () => {
    const playlists = [
      { id: 1, creator: { userId: 42 } },
      { id: 2, creator: { userId: '42' } },
      { id: 3, creator: { userId: 7 } },
    ];

    expect(getWritableUserPlaylists(playlists, '42', 1)).toEqual([
      playlists[1],
    ]);
  });

  it('handles missing and malformed playlist data', () => {
    expect(getWritableUserPlaylists(undefined, 1, 2)).toEqual([]);
    expect(getWritableUserPlaylists([{ id: 1 }, null], 1, 2)).toEqual([]);
  });
});

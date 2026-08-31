import { describe, expect, it } from 'vitest';

import { mapCachedTrackDetails } from '../cachedTrackDetails';

describe('mapCachedTrackDetails', () => {
  it('preserves bulkGet request order', () => {
    expect(
      mapCachedTrackDetails([
        { detail: { id: 22 }, privileges: { id: 22, fee: 0 } },
        { detail: { id: 11 }, privileges: { id: 11, fee: 1 } },
      ])
    ).toEqual({
      songs: [{ id: 22 }, { id: 11 }],
      privileges: [
        { id: 22, fee: 0 },
        { id: 11, fee: 1 },
      ],
    });
  });

  it('returns undefined when any requested cache entry is missing', () => {
    expect(
      mapCachedTrackDetails([
        { detail: { id: 22 }, privileges: { id: 22 } },
        undefined,
      ])
    ).toBeUndefined();
  });
});

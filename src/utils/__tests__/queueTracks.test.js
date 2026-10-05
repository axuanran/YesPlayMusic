import { describe, expect, it } from 'vitest';

import {
  collectQueueTrackIds,
  getMissingTrackIds,
  retainQueueTracks,
} from '../queueTracks';

describe('queue track utilities', () => {
  it('collects bounded upcoming tracks before play-next entries', () => {
    expect(collectQueueTrackIds([1, 2, 3, 4], 0, [9, 3], 2)).toEqual([
      2, 3, 9, 3,
    ]);
  });

  it('finds unique missing IDs with constant-time loaded lookup', () => {
    expect(getMissingTrackIds([2, 3, 3, 4], [{ id: 2 }, { id: 4 }])).toEqual([
      3,
    ]);
  });

  it('merges new tracks and removes entries no longer in the queue', () => {
    expect(
      retainQueueTracks(
        [
          { id: 1, name: 'stale' },
          { id: 2, name: 'old' },
        ],
        [
          { id: 2, name: 'fresh' },
          { id: 3, name: 'new' },
        ],
        [3, 2, 3]
      )
    ).toEqual([
      { id: 3, name: 'new' },
      { id: 2, name: 'fresh' },
    ]);
  });
});

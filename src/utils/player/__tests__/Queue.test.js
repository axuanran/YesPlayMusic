import { describe, expect, it } from 'vitest';
import PlayerQueue, { REPEAT_MODE } from '../Queue';

describe('PlayerQueue', () => {
  it('returns the next and previous tracks', () => {
    const queue = new PlayerQueue({
      list: [1, 2, 3],
      current: 1,
    });

    expect(queue.getSibling(true)).toEqual([3, 2]);
    expect(queue.getSibling(false)).toEqual([1, 0]);
  });

  it('wraps at list boundaries when repeat mode is on', () => {
    const queue = new PlayerQueue({
      list: [1, 2, 3],
      current: 2,
      repeatMode: REPEAT_MODE.ON,
    });

    expect(queue.getSibling(true)).toEqual([1, 0]);
  });

  it('respects reversed playback direction', () => {
    const queue = new PlayerQueue({
      list: [1, 2, 3],
      current: 1,
      reversed: true,
    });

    expect(queue.getSibling(true)).toEqual([1, 0]);
    expect(queue.getSibling(false)).toEqual([3, 2]);
  });

  it('wraps reversed playback at the start of the list', () => {
    const queue = new PlayerQueue({
      list: [1, 2, 3],
      current: 0,
      repeatMode: REPEAT_MODE.ON,
      reversed: true,
    });

    expect(queue.getSibling(true)).toEqual([3, 2]);
  });

  it('takes queued play-next tracks before normal queue traversal', () => {
    const queue = new PlayerQueue({
      list: [1, 2, 3],
      current: 0,
      playNextList: [9],
    });

    expect(queue.takePlayNext()).toBe(9);
    expect(queue.playNextList).toEqual([]);
  });

  it('replaces a queue and selects the requested track', () => {
    const queue = new PlayerQueue();

    expect(queue.replace([4, 5, 6], 5)).toBe(5);
    expect(queue.list).toEqual([4, 5, 6]);
    expect(queue.current).toBe(1);
  });

  it('replaces a queue and selects the first track by default', () => {
    const queue = new PlayerQueue();

    expect(queue.replace([4, 5, 6])).toBe(4);
    expect(queue.current).toBe(0);
  });

  it('exports and imports queue state for persistence compatibility', () => {
    const queue = new PlayerQueue({
      list: [1, 2, 3],
      current: 1,
      shuffledList: [2, 1, 3],
      shuffledCurrent: 0,
      shuffleEnabled: true,
      repeatMode: REPEAT_MODE.ON,
      reversed: true,
      playNextList: [9],
    });
    const restored = new PlayerQueue();

    restored.importState(queue.exportState());

    expect(restored.exportState()).toEqual(queue.exportState());
    expect(restored.activeList).toEqual([2, 1, 3]);
    expect(restored.activeCurrent).toBe(0);
  });

  it('adds, clears, and removes queued play-next tracks in place', () => {
    const playNextList = [8, 9];
    const queue = new PlayerQueue({ playNextList });

    queue.addPlayNext(10);
    queue.removePlayNext(1);
    queue.clearPlayNext();

    expect(playNextList).toEqual([]);
    expect(queue.playNextList).toBe(playNextList);
  });

  it('syncs current to a track only when the track is in the active list', () => {
    const queue = new PlayerQueue({
      list: [1, 2, 3],
      current: 0,
    });

    expect(queue.syncCurrentToTrack(3)).toBe(true);
    expect(queue.current).toBe(2);

    expect(queue.syncCurrentToTrack(9)).toBe(false);
    expect(queue.current).toBe(2);
  });
});

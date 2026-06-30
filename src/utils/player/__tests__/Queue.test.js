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
});

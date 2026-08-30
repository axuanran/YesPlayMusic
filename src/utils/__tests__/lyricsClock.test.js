import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_LYRICS_INTERVAL,
  findActiveLyricIndex,
  getLyricsClockInterval,
  VISIBLE_LYRICS_INTERVAL,
} from '../lyricsClock.js';

describe('lyrics clock', () => {
  it.each([
    [true, false, false, VISIBLE_LYRICS_INTERVAL],
    [true, true, false, VISIBLE_LYRICS_INTERVAL],
    [false, true, false, BACKGROUND_LYRICS_INTERVAL],
    [true, true, true, BACKGROUND_LYRICS_INTERVAL],
    [false, false, false, null],
    [false, false, true, null],
  ])(
    'selects interval for visible=%s desktop=%s hidden=%s',
    (showLyrics, desktopLyricsEnabled, documentHidden, expected) => {
      expect(
        getLyricsClockInterval({
          showLyrics,
          desktopLyricsEnabled,
          documentHidden,
        })
      ).toBe(expected);
    }
  );

  it('finds the active line with ordered lyric timestamps', () => {
    const lines = [{ time: 1 }, { time: 3 }, { time: 7 }, { time: 12 }];

    expect(findActiveLyricIndex(lines, 0.5)).toBe(-1);
    expect(findActiveLyricIndex(lines, 1)).toBe(0);
    expect(findActiveLyricIndex(lines, 6.9)).toBe(1);
    expect(findActiveLyricIndex(lines, 12)).toBe(3);
    expect(findActiveLyricIndex(lines, 99)).toBe(3);
  });

  it('rejects missing lines and invalid progress', () => {
    expect(findActiveLyricIndex([], 1)).toBe(-1);
    expect(findActiveLyricIndex([{ time: 1 }], Number.NaN)).toBe(-1);
  });
});

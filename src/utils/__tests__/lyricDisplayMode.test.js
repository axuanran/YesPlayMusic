import { describe, expect, it } from 'vitest';
import {
  getLyricDisplayModes,
  getNextLyricDisplayMode,
  LYRIC_DISPLAY_MODE,
} from '../lyricDisplayMode.js';

describe('lyric display mode', () => {
  it('cycles Japanese lyrics through translation, pronunciation and hidden', () => {
    const modes = getLyricDisplayModes({
      hasTranslation: true,
      hasPronunciation: true,
    });

    expect(modes).toEqual([
      LYRIC_DISPLAY_MODE.TRANSLATION,
      LYRIC_DISPLAY_MODE.PRONUNCIATION,
      LYRIC_DISPLAY_MODE.NONE,
    ]);
    expect(getNextLyricDisplayMode(modes, LYRIC_DISPLAY_MODE.TRANSLATION)).toBe(
      LYRIC_DISPLAY_MODE.PRONUNCIATION
    );
    expect(
      getNextLyricDisplayMode(modes, LYRIC_DISPLAY_MODE.PRONUNCIATION)
    ).toBe(LYRIC_DISPLAY_MODE.NONE);
    expect(getNextLyricDisplayMode(modes, LYRIC_DISPLAY_MODE.NONE)).toBe(
      LYRIC_DISPLAY_MODE.TRANSLATION
    );
  });

  it('cycles translated lyrics directly through translation and hidden', () => {
    const modes = getLyricDisplayModes({
      hasTranslation: true,
      hasPronunciation: false,
    });

    expect(modes).toEqual([
      LYRIC_DISPLAY_MODE.TRANSLATION,
      LYRIC_DISPLAY_MODE.NONE,
    ]);
    expect(getNextLyricDisplayMode(modes, LYRIC_DISPLAY_MODE.TRANSLATION)).toBe(
      LYRIC_DISPLAY_MODE.NONE
    );
  });

  it('supports pronunciation-only lyrics and no secondary lyrics', () => {
    expect(
      getLyricDisplayModes({
        hasTranslation: false,
        hasPronunciation: true,
      })
    ).toEqual([LYRIC_DISPLAY_MODE.PRONUNCIATION, LYRIC_DISPLAY_MODE.NONE]);
    expect(getLyricDisplayModes()).toEqual([LYRIC_DISPLAY_MODE.NONE]);
  });
});

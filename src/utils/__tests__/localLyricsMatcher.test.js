import { describe, expect, it } from 'vitest';
import {
  createLocalLyricSearchKeywords,
  rankLocalLyricMatches,
  scoreLocalLyricMatch,
} from '../localLyricsMatcher.js';

const localTrack = {
  name: '夜曲',
  ar: [{ name: '周杰伦' }],
  dt: 226000,
};

describe('local lyrics matcher', () => {
  it('ranks title, artist and duration matches first', () => {
    const best = {
      id: 1,
      name: '夜曲',
      ar: [{ name: '周杰伦' }],
      dt: 225000,
    };
    const wrongArtist = {
      id: 2,
      name: '夜曲',
      ar: [{ name: '其他歌手' }],
      dt: 225000,
    };

    expect(scoreLocalLyricMatch(localTrack, best)).toBeGreaterThan(
      scoreLocalLyricMatch(localTrack, wrongArtist)
    );
    expect(
      rankLocalLyricMatches(localTrack, [wrongArtist, best])[0].track
    ).toBe(best);
  });

  it('rejects unrelated search results', () => {
    expect(
      rankLocalLyricMatches(localTrack, [
        {
          id: 3,
          name: '完全不同',
          ar: [{ name: '其他歌手' }],
          dt: 100000,
        },
      ])
    ).toEqual([]);
  });

  it('builds a focused title and artist query', () => {
    expect(createLocalLyricSearchKeywords(localTrack)).toBe('夜曲 周杰伦');
  });

  it('supports the legacy search result artist and duration fields', () => {
    expect(
      scoreLocalLyricMatch(localTrack, {
        name: '夜曲',
        artists: [{ name: '周杰伦' }],
        duration: 225000,
      })
    ).toBeGreaterThan(0.9);
  });
});

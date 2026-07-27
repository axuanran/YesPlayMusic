import { describe, expect, it } from 'vitest';
import { getSearchTypeCode, normalizeSearchType } from '../searchType.js';

describe('search type', () => {
  it('normalizes supported route values', () => {
    expect(normalizeSearchType('music-videos')).toBe('musicVideos');
    expect(normalizeSearchType('podcasts')).toBe('podcasts');
    expect(getSearchTypeCode('music-videos')).toBe(1004);
  });

  it('returns an empty value when leaving the search route', () => {
    expect(normalizeSearchType(undefined)).toBe('');
    expect(normalizeSearchType(null)).toBe('');
    expect(getSearchTypeCode(undefined)).toBeNull();
  });

  it('rejects unsupported route values', () => {
    expect(normalizeSearchType('unknown')).toBe('');
    expect(getSearchTypeCode('unknown')).toBeNull();
  });
});

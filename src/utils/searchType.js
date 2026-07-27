import { camelCase } from 'change-case';

export const SEARCH_TYPE_CODES = Object.freeze({
  musicVideos: 1004,
  tracks: 1,
  albums: 10,
  artists: 100,
  playlists: 1000,
  podcasts: 1009,
});

export function normalizeSearchType(value) {
  if (typeof value !== 'string' || value.length === 0) return '';
  const type = camelCase(value);
  return Object.hasOwn(SEARCH_TYPE_CODES, type) ? type : '';
}

export function getSearchTypeCode(value) {
  const type = normalizeSearchType(value);
  return type ? SEARCH_TYPE_CODES[type] : null;
}

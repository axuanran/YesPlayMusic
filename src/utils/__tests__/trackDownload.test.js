import { describe, expect, it } from 'vitest';
import {
  createTrackDownloadFilename,
  createTrackDownloadMetadata,
  normalizeTrackDownloadQuality,
  sanitizeTrackDownloadName,
} from '../trackDownload.js';

describe('track download helpers', () => {
  it('creates a safe filename with the selected quality extension', () => {
    expect(
      createTrackDownloadFilename(
        {
          name: 'A/B: C?',
          ar: [{ name: 'Artist*' }, { name: 'Guest' }],
        },
        'lossless'
      )
    ).toBe('Artist_, Guest - A_B_ C_.flac');
  });

  it('removes Windows-reserved characters and trailing dots', () => {
    expect(sanitizeTrackDownloadName('  bad<>:"/\\|?*...  ')).toBe(
      'bad_________'
    );
  });

  it('falls back to exhigh for unsupported qualities', () => {
    expect(normalizeTrackDownloadQuality('unknown')).toBe('exhigh');
    expect(createTrackDownloadFilename({ name: 'Song' }, 'unknown')).toBe(
      'Song.mp3'
    );
  });

  it('maps track, album, artwork and lyrics into download metadata', () => {
    expect(
      createTrackDownloadMetadata(
        {
          al: {
            artist: { name: 'Album Artist' },
            name: 'Album',
            picUrl: 'https://example.test/cover.jpg',
            publishTime: Date.UTC(2024, 0, 2),
          },
          ar: [{ name: 'Artist' }, { name: 'Guest' }],
          cd: '2/2',
          name: 'Song',
          no: 3,
        },
        {
          lrc: { lyric: '[00:01.00]Line' },
          tlyric: { lyric: '[00:01.00]Translation' },
        }
      )
    ).toEqual({
      album: 'Album',
      albumArtist: 'Album Artist',
      artist: 'Artist, Guest',
      coverUrl: 'https://example.test/cover.jpg',
      discNumber: 2,
      lyrics: '[00:01.00]Line',
      publishingDate: '2024-01-02',
      title: 'Song',
      trackNumber: 3,
      translatedLyrics: '[00:01.00]Translation',
    });
  });
});

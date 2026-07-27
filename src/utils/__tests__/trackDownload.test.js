import { describe, expect, it } from 'vitest';
import {
  createTrackDownloadFilename,
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
});

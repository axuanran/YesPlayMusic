import { describe, expect, it } from 'vitest';
import {
  createMediaSessionMetadata,
  createMediaSessionPositionState,
  getMediaSessionDuration,
} from '../mediaSession.js';

describe('media session data', () => {
  it('maps alternate track fields and includes complete artwork metadata', () => {
    const metadata = createMediaSessionMetadata({
      name: 'Track',
      ar: [],
      al: {},
      artists: [{ name: 'Artist One' }, { name: 'Artist Two' }],
      album: { name: 'Album', picUrl: 'cover.jpg' },
    });

    expect(metadata).toMatchObject({
      title: 'Track',
      artist: 'Artist One, Artist Two',
      album: 'Album',
    });
    expect(metadata.artwork).toHaveLength(6);
    expect(metadata.artwork.at(-1)).toEqual({
      src: 'cover.jpg?param=512y512',
      sizes: '512x512',
      type: 'image/jpeg',
    });
  });

  it('normalizes Android artwork shapes and replaces stale size parameters', () => {
    const metadata = createMediaSessionMetadata({
      name: 'Android Track',
      simpleSong: {
        al: {
          picUrl: 'http://p1.music.126.net/cover.jpg?param=64y64',
        },
      },
    });

    expect(metadata.artwork[0]).toEqual({
      src: 'https://p1.music.126.net/cover.jpg?param=96y96',
      sizes: '96x96',
      type: 'image/jpeg',
    });
    expect(metadata.artwork.at(-1)?.src).toBe(
      'https://p1.music.126.net/cover.jpg?param=512y512'
    );
  });

  it('keeps fractional duration and playback position precision', () => {
    expect(getMediaSessionDuration({ dt: 180543 })).toBe(180.543);
    expect(
      createMediaSessionPositionState({
        duration: 180.543,
        playbackRate: 1.25,
        position: 42.375,
      })
    ).toEqual({
      duration: 180.543,
      playbackRate: 1.25,
      position: 42.375,
    });
  });

  it('clamps invalid positions and rejects unknown durations', () => {
    expect(
      createMediaSessionPositionState({
        duration: 100,
        playbackRate: 0,
        position: 120,
      })
    ).toEqual({
      duration: 100,
      playbackRate: 1,
      position: 100,
    });
    expect(
      createMediaSessionPositionState({
        duration: 0,
        playbackRate: 1,
        position: 0,
      })
    ).toBeNull();
  });
});

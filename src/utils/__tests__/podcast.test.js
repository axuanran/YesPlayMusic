import { describe, expect, it } from 'vitest';
import {
  normalizePodcastProgram,
  normalizePodcastPrograms,
} from '../podcast.js';

const radio = {
  id: 9,
  name: 'Radio',
  picUrl: 'radio.jpg',
  dj: { userId: 3, nickname: 'Host' },
};

describe('podcast program normalization', () => {
  it('maps an episode to the existing track shape', () => {
    const track = normalizePodcastProgram(
      {
        id: 12,
        name: 'Episode',
        duration: 3000,
        serialNum: 4,
        coverUrl: 'episode.jpg',
        mainSong: { id: 99, name: 'Original' },
      },
      radio
    );

    expect(track).toMatchObject({
      id: 99,
      name: 'Episode',
      dt: 3000,
      playable: true,
      alia: [],
      ar: [{ id: 0, name: 'Host' }],
      al: { id: 0, name: 'Radio', picUrl: 'episode.jpg' },
      podcast: { programId: 12, radioId: 9, serialNumber: 4 },
    });
  });

  it('preserves song artist and album metadata', () => {
    const track = normalizePodcastProgram(
      {
        id: 12,
        mainSong: {
          id: 99,
          ar: [{ id: 1, name: 'Artist' }],
          al: { id: 2, name: 'Album', picUrl: 'album.jpg' },
        },
      },
      radio
    );

    expect(track.ar[0].name).toBe('Artist');
    expect(track.al).toMatchObject({
      id: 2,
      name: 'Album',
      picUrl: 'album.jpg',
    });
  });

  it('filters invalid programs without changing list order', () => {
    const tracks = normalizePodcastPrograms(
      [
        { id: 1, mainSong: { id: 10 } },
        { id: 2 },
        { id: 4, mainSong: { id: null } },
        { id: 3, mainSong: { id: 30 } },
      ],
      radio
    );

    expect(tracks.map(track => track.id)).toEqual([10, 30]);
  });

  it('returns an empty list for invalid input', () => {
    expect(normalizePodcastPrograms(null, radio)).toEqual([]);
  });
});

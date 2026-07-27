import { describe, expect, it } from 'vitest';
import {
  loadClientPlaybackHistory,
  recordClientPlayback,
  saveClientPlaybackHistory,
} from '../clientPlaybackHistory.js';

const track = id => ({
  id,
  name: `Track ${id}`,
  ar: [{ id: 1, name: 'Artist' }],
  al: { id: 2, name: 'Album', picUrl: 'cover.jpg' },
  dt: 3000,
});

describe('client playback history', () => {
  it('moves replayed tracks to the front and increments their count', () => {
    let history = recordClientPlayback(null, {
      track: track(1),
      playedAt: 10,
    });
    history = recordClientPlayback(history, {
      track: track(2),
      playedAt: 20,
    });
    history = recordClientPlayback(history, {
      track: track(1),
      playedAt: 30,
    });

    expect(history.tracks.map(item => item.id)).toEqual([1, 2]);
    expect(history.tracks[0]).toMatchObject({
      playedAt: 30,
      playCount: 2,
    });
  });

  it('records a playlist once when the source flag is set', () => {
    const history = recordClientPlayback(null, {
      track: track(1),
      source: {
        id: 8,
        type: 'playlist',
        name: 'Playlist',
        coverImgUrl: 'playlist.jpg',
      },
      recordSource: true,
      playedAt: 10,
    });

    expect(history.playlists).toEqual([
      {
        id: 8,
        name: 'Playlist',
        coverImgUrl: 'playlist.jpg',
        playedAt: 10,
        playCount: 1,
      },
    ]);
  });

  it('ignores non-playlist sources and invalid records', () => {
    const history = recordClientPlayback(null, {
      track: {},
      source: { id: 8, type: 'album' },
      recordSource: true,
    });

    expect(history).toEqual({ tracks: [], playlists: [] });
  });

  it('caps local history to a bounded storage size', () => {
    let history = null;
    for (let id = 1; id <= 205; id += 1) {
      history = recordClientPlayback(history, {
        track: track(id),
        source: {
          id,
          type: 'playlist',
          name: `Playlist ${id}`,
        },
        recordSource: true,
        playedAt: id,
      });
    }

    expect(history.tracks).toHaveLength(200);
    expect(history.playlists).toHaveLength(50);
    expect(history.tracks[0].id).toBe(205);
    expect(history.playlists[0].id).toBe(205);
  });

  it('loads malformed storage safely', () => {
    const storage = { getItem: () => '{bad json' };
    const loaded = loadClientPlaybackHistory(storage);
    expect(loaded).toEqual({ tracks: [], playlists: [] });
  });

  it('does not interrupt playback when storage is unavailable', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(
      saveClientPlaybackHistory({ tracks: [], playlists: [] }, storage)
    ).toBe(false);
  });
});

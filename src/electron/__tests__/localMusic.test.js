import { describe, expect, it, vi } from 'vitest';
import {
  createLocalMusicId,
  createLocalMusicRecord,
  createLocalMusicService,
  toPublicLocalMusicTrack,
} from '../localMusic.js';

function createStore() {
  const values = new Map();
  return {
    get: vi.fn((key, fallback) =>
      values.has(key) ? values.get(key) : fallback
    ),
    set: vi.fn((key, value) => values.set(key, value)),
  };
}

describe('local music service', () => {
  it('creates stable local IDs and maps metadata to the player track model', () => {
    const metadata = {
      common: {
        title: 'Local Song',
        artists: ['Artist A', 'Artist B'],
        album: 'Local Album',
        track: { no: 3 },
        picture: [{ format: 'image/png', data: new Uint8Array([1]) }],
      },
      format: { duration: 123.456 },
    };
    const record = createLocalMusicRecord('C:/Music/song.flac', metadata);
    const track = toPublicLocalMusicTrack(record, 'http://127.0.0.1:3210');

    expect(record.id).toBe(createLocalMusicId('C:/Music/song.flac'));
    expect(track).toMatchObject({
      id: record.id,
      name: 'Local Song',
      ar: [{ id: 0, name: 'Artist A, Artist B' }],
      al: { id: 0, name: 'Local Album' },
      dt: 123456,
      no: 3,
      playable: true,
      local: true,
    });
    expect(track.sourceUrl).toContain(encodeURIComponent(record.id));
    expect(track.al.picUrl).toContain('/artwork');
  });

  it('imports supported files, deduplicates them and prunes missing files', async () => {
    const store = createStore();
    const existingFiles = new Set([
      'C:\\Music\\one.mp3',
      'C:\\Music\\two.flac',
    ]);
    const metadataParser = vi.fn(async filePath => ({
      common: { title: filePath.includes('one') ? 'One' : 'Two' },
      format: { duration: 60 },
    }));
    const service = createLocalMusicService({
      store,
      baseUrl: 'http://127.0.0.1:3210',
      metadataParser,
      fileExists: filePath => existingFiles.has(filePath),
    });

    const result = await service.importFiles([
      'C:\\Music\\one.mp3',
      'C:\\Music\\one.mp3',
      'C:\\Music\\two.flac',
      'C:\\Music\\notes.txt',
    ]);

    expect(result.imported).toBe(3);
    expect(result.skipped).toBe(1);
    expect(result.tracks).toHaveLength(2);
    existingFiles.delete('C:\\Music\\one.mp3');
    expect(service.list()).toHaveLength(1);
  });

  it('removes catalog entries without touching source files', async () => {
    const store = createStore();
    const service = createLocalMusicService({
      store,
      baseUrl: 'http://127.0.0.1:3210',
      metadataParser: async () => ({ common: {}, format: {} }),
      fileExists: () => true,
    });
    const { tracks } = await service.importFiles(['C:\\Music\\song.mp3']);

    expect(service.remove([tracks[0].id])).toEqual([]);
  });
});

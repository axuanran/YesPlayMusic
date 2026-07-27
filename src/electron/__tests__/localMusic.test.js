import { describe, expect, it, vi } from 'vitest';
import {
  createLocalMusicFolderId,
  createLocalMusicId,
  createLocalMusicRecord,
  createLocalMusicService,
  getAllowedLocalMediaOrigin,
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
  it('allows only loopback renderer origins for local media CORS', () => {
    expect(getAllowedLocalMediaOrigin('http://127.0.0.1:20201')).toBe(
      'http://127.0.0.1:20201'
    );
    expect(getAllowedLocalMediaOrigin('http://localhost:5173')).toBe(
      'http://localhost:5173'
    );
    expect(getAllowedLocalMediaOrigin('https://example.com')).toBeNull();
    expect(getAllowedLocalMediaOrigin('http://127.0.0.1.evil.test')).toBeNull();
  });

  it('creates stable local IDs and maps metadata to the player track model', () => {
    const metadata = {
      common: {
        title: 'Local Song',
        artists: ['Artist A', 'Artist B'],
        album: 'Local Album',
        track: { no: 3 },
        picture: [{ format: 'image/png', data: new Uint8Array([1]) }],
        lyrics: [
          {
            syncText: [
              { timestamp: 1000, text: 'First line' },
              { timestamp: 2500, text: 'Second line' },
            ],
          },
        ],
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
      localLyrics: '[00:01.00]First line\n[00:02.50]Second line',
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
      fileStat: async () => ({ size: 100, mtimeMs: 200 }),
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
      fileStat: async () => ({ size: 100, mtimeMs: 200 }),
    });
    const { tracks } = await service.importFiles(['C:\\Music\\song.mp3']);

    expect(service.remove([tracks[0].id])).toEqual([]);
  });

  it('imports a folder as a playlist and only watches it while active', async () => {
    const store = createStore();
    const folderPath = 'C:\\Music';
    let files = ['C:\\Music\\one.mp3', 'C:\\Music\\nested\\two.flac'];
    const folderScanner = vi.fn(async () => files);
    const watcher = { close: vi.fn(), on: vi.fn() };
    const watchFactory = vi.fn(() => watcher);
    const onChange = vi.fn();
    const service = createLocalMusicService({
      store,
      baseUrl: 'http://127.0.0.1:3210',
      metadataParser: async filePath => ({
        common: {
          title: filePath.includes('one') ? 'One' : 'Two',
          picture: filePath.includes('one')
            ? [{ format: 'image/jpeg', data: new Uint8Array([1]) }]
            : [],
        },
        format: { duration: 60 },
      }),
      fileExists: () => true,
      folderScanner,
      fileStat: async () => ({ size: 100, mtimeMs: 200 }),
      watchFactory,
    });
    service.onChange(onChange);

    const result = await service.addFolders([folderPath]);
    const folderId = createLocalMusicFolderId(folderPath);

    expect(result).toMatchObject({ added: 1, skipped: 0 });
    expect(result.folders).toEqual([
      expect.objectContaining({
        id: folderId,
        name: 'Music',
        trackCount: 2,
        active: false,
        coverUrl: expect.stringContaining('/artwork'),
      }),
    ]);
    expect(watchFactory).not.toHaveBeenCalled();

    const opened = await service.activateFolder(folderId);
    expect(opened.tracks).toHaveLength(2);
    expect(watchFactory).toHaveBeenCalledTimes(1);

    files = ['C:\\Music\\one.mp3'];
    const refreshed = await service.refreshFolder(folderId);
    expect(refreshed.tracks).toHaveLength(1);
    expect(onChange).toHaveBeenCalledWith({ folderId });

    service.deactivateFolder(folderId);
    expect(watcher.close).toHaveBeenCalledOnce();
  });

  it('removes a folder playlist without touching source files', async () => {
    const store = createStore();
    const folderPath = 'C:\\Music';
    const service = createLocalMusicService({
      store,
      baseUrl: 'http://127.0.0.1:3210',
      metadataParser: async () => ({ common: {}, format: {} }),
      fileExists: () => true,
      folderScanner: async () => ['C:\\Music\\song.mp3'],
      fileStat: async () => ({ size: 100, mtimeMs: 200 }),
      watchFactory: () => ({ close: vi.fn(), on: vi.fn() }),
    });
    await service.addFolders([folderPath]);

    expect(service.removeFolder(createLocalMusicFolderId(folderPath))).toEqual(
      []
    );
    expect(service.list()).toEqual([]);
  });
});

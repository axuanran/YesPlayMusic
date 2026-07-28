import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  embedAudioMetadata,
  normalizeAudioMetadata,
  parseSynchronizedLyrics,
  stripLrcTimestamps,
} from '../audioMetadata.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
});

describe('downloaded audio metadata', () => {
  it('normalizes fields and resolves a relative artwork URL', () => {
    expect(
      normalizeAudioMetadata(
        {
          album: 'Album',
          artist: 'Artist',
          coverUrl: '/cover.jpg',
          discNumber: '2',
          title: 'Song',
          trackNumber: 3,
        },
        'http://127.0.0.1:20201/library'
      )
    ).toMatchObject({
      album: 'Album',
      artist: 'Artist',
      coverUrl: 'http://127.0.0.1:20201/cover.jpg',
      discNumber: 2,
      title: 'Song',
      trackNumber: 3,
    });
  });

  it('parses synchronized LRC and creates a plain lyrics fallback', () => {
    const lyrics =
      '[ar:Artist]\n[offset:100]\n[00:01.20]First\n[00:02.345][00:03.00]Second';

    expect(parseSynchronizedLyrics(lyrics)).toEqual([
      { text: 'First', timeMs: 1300 },
      { text: 'Second', timeMs: 2445 },
      { text: 'Second', timeMs: 3100 },
    ]);
    expect(stripLrcTimestamps(lyrics)).toBe('First\nSecond');
  });

  it('embeds tags, cover and lyrics before replacing the audio file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ypm-tag-test-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'song.mp3');
    await writeFile(filePath, new Uint8Array([1, 2, 3]));
    const taggedBytes = new Uint8Array([4, 5, 6, 7]);
    const writeMetadataFn = vi.fn().mockResolvedValue(taggedBytes);

    await expect(
      embedAudioMetadata({
        filePath,
        metadata: {
          album: 'Album',
          artist: 'Artist',
          coverUrl: 'https://example.test/cover.jpg',
          lyrics: '[00:01.00]Line',
          title: 'Song',
        },
        net: {
          fetch: vi.fn().mockResolvedValue(
            new Response(new Uint8Array([255, 216, 255, 217]), {
              headers: { 'content-type': 'image/jpeg' },
            })
          ),
        },
        writeMetadataFn,
      })
    ).resolves.toEqual({ status: 'completed' });

    expect(writeMetadataFn).toHaveBeenCalledWith(
      filePath,
      expect.objectContaining({
        lyrics: expect.objectContaining({
          synchronized: [{ text: 'Line', timeMs: 1000 }],
          unsynchronized: 'Line',
        }),
        pictures: [
          expect.objectContaining({
            mimeType: 'image/jpeg',
          }),
        ],
        tag: expect.objectContaining({
          album: 'Album',
          artist: 'Artist',
          title: 'Song',
        }),
      })
    );
    expect(new Uint8Array(await readFile(filePath))).toEqual(taggedBytes);
  });
});

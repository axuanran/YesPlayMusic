import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  beginTrackDownloadBatch,
  finishTrackDownloadBatch,
  normalizeTrackDownloadRequest,
  saveArtworkDownload,
  saveTrackDownload,
  saveTrackDownloadToBatch,
} from '../trackDownload.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
});

describe('track download request validation', () => {
  it('accepts HTTP audio URLs and sanitizes the suggested filename', () => {
    expect(
      normalizeTrackDownloadRequest({
        url: 'https://example.test/audio?id=1',
        suggestedName: 'Artist/A:Song?.mp3',
      })
    ).toEqual({
      url: 'https://example.test/audio?id=1',
      suggestedName: 'Artist_A_Song_.mp3',
    });
  });

  it('resolves development resolver paths against the renderer URL', () => {
    expect(
      normalizeTrackDownloadRequest(
        {
          url: '/resolver-api/audio/track.mp3',
          suggestedName: 'track.mp3',
        },
        'http://127.0.0.1:20201/#/settings'
      )
    ).toEqual({
      url: 'http://127.0.0.1:20201/resolver-api/audio/track.mp3',
      suggestedName: 'track.mp3',
    });
  });

  it('rejects local files, scripts and malformed requests', () => {
    expect(
      normalizeTrackDownloadRequest({
        url: 'file:///secret',
        suggestedName: 'track.mp3',
      })
    ).toBeNull();
    expect(
      normalizeTrackDownloadRequest({
        url: 'javascript:alert(1)',
        suggestedName: 'track.mp3',
      })
    ).toBeNull();
    expect(normalizeTrackDownloadRequest(null)).toBeNull();
  });

  it('streams the response to a temporary file before publishing it', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ypm-download-test-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'track.mp3');
    const onProgress = vi.fn();
    const body = new Uint8Array([1, 2, 3, 4]);

    const result = await saveTrackDownload({
      win: {
        webContents: {
          getURL: () => 'http://127.0.0.1:20201/',
        },
      },
      dialog: {
        showSaveDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePath,
        }),
      },
      net: {
        fetch: vi.fn().mockResolvedValue(
          new Response(body, {
            status: 200,
            headers: {
              'content-type': 'audio/mpeg',
              'content-length': String(body.length),
            },
          })
        ),
      },
      payload: {
        url: 'https://example.test/track',
        suggestedName: 'track.mp3',
      },
      onProgress,
    });

    expect(result).toMatchObject({
      status: 'completed',
      filePath,
      bytes: body.length,
    });
    expect(new Uint8Array(await readFile(filePath))).toEqual(body);
    expect(onProgress).toHaveBeenLastCalledWith({
      received: body.length,
      total: body.length,
    });
  });

  it('downloads image artwork and rejects non-image responses', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ypm-artwork-test-'));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, 'cover.jpg');
    const win = {
      webContents: {
        getURL: () => 'http://127.0.0.1:20201/',
      },
    };
    const dialog = {
      showSaveDialog: vi.fn().mockResolvedValue({
        canceled: false,
        filePath,
      }),
    };
    const image = new Uint8Array([255, 216, 255, 217]);

    const result = await saveArtworkDownload({
      win,
      dialog,
      net: {
        fetch: vi.fn().mockResolvedValue(
          new Response(image, {
            headers: { 'content-type': 'image/jpeg' },
          })
        ),
      },
      payload: {
        url: '/local-music/local%3Atrack/artwork',
        suggestedName: 'Artist - Song - cover.jpg',
      },
    });

    expect(result).toMatchObject({
      status: 'completed',
      filePath,
      bytes: image.length,
    });
    expect(new Uint8Array(await readFile(filePath))).toEqual(image);

    await expect(
      saveArtworkDownload({
        win,
        dialog,
        net: {
          fetch: vi.fn().mockResolvedValue(
            new Response('<html></html>', {
              headers: { 'content-type': 'text/html' },
            })
          ),
        },
        payload: {
          url: 'https://example.test/not-an-image',
          suggestedName: 'cover.jpg',
        },
      })
    ).rejects.toThrow('Unexpected download content type');
  });

  it('downloads a batch into one directory and avoids duplicate names', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'ypm-batch-test-'));
    temporaryDirectories.push(directory);
    const ownerId = 7;
    const win = {
      webContents: {
        getURL: () => 'http://127.0.0.1:20201/',
      },
    };
    const batch = await beginTrackDownloadBatch({
      win,
      dialog: {
        showOpenDialog: vi.fn().mockResolvedValue({
          canceled: false,
          filePaths: [directory],
        }),
      },
      ownerId,
      playlistName: 'Playlist',
    });
    const net = {
      fetch: vi.fn().mockImplementation(
        async () =>
          new Response(new Uint8Array([1, 2]), {
            headers: { 'content-type': 'audio/mpeg' },
          })
      ),
    };

    for (let index = 0; index < 2; index += 1) {
      await saveTrackDownloadToBatch({
        win,
        net,
        ownerId,
        payload: {
          batchId: batch.batchId,
          url: '/resolver-api/track',
          suggestedName: 'track.mp3',
        },
      });
    }

    expect(await readFile(path.join(directory, 'track.mp3'))).toBeTruthy();
    expect(await readFile(path.join(directory, 'track (2).mp3'))).toBeTruthy();
    expect(finishTrackDownloadBatch(ownerId, batch.batchId)).toBe(true);
    await expect(
      saveTrackDownloadToBatch({
        win,
        net,
        ownerId,
        payload: {
          batchId: batch.batchId,
          url: '/resolver-api/track',
          suggestedName: 'track.mp3',
        },
      })
    ).rejects.toThrow('Invalid or expired download batch');
  });
});

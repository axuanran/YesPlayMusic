import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  normalizeTrackDownloadRequest,
  saveTrackDownload,
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
      win: {},
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
});

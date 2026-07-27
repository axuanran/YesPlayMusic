import { createWriteStream } from 'node:fs';
import { copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAX_FILENAME_LENGTH = 240;

function sanitizeSuggestedName(value) {
  const normalized = String(value || '')
    .replace(/\p{Cc}/gu, '_')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim();
  return (normalized || 'track.mp3').slice(0, MAX_FILENAME_LENGTH);
}

export function normalizeTrackDownloadRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  let url;
  try {
    url = new URL(payload.url);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  return {
    url: url.toString(),
    suggestedName: sanitizeSuggestedName(payload.suggestedName),
  };
}

export async function saveTrackDownload({
  win,
  dialog,
  net,
  payload,
  onProgress,
}) {
  const request = normalizeTrackDownloadRequest(payload);
  if (!request) throw new Error('Invalid download request');

  const selection = await dialog.showSaveDialog(win, {
    title: '保存歌曲',
    defaultPath: request.suggestedName,
    filters: [
      {
        name: 'Audio',
        extensions: ['mp3', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'wav'],
      },
    ],
  });
  if (selection.canceled || !selection.filePath) {
    return { status: 'canceled' };
  }

  const response = await net.fetch(request.url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (
    contentType &&
    !/^audio\/|^application\/octet-stream/i.test(contentType)
  ) {
    throw new Error(`Unexpected download content type: ${contentType}`);
  }

  const total = Math.max(
    0,
    Number(response.headers.get('content-length')) || 0
  );
  let received = 0;
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      onProgress?.({ received, total });
      callback(null, chunk);
    },
  });
  const temporaryPath = path.join(
    path.dirname(selection.filePath),
    `.${path.basename(selection.filePath)}.${randomUUID()}.part`
  );

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      progress,
      createWriteStream(temporaryPath, { flags: 'wx' })
    );
    await copyFile(temporaryPath, selection.filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }

  return {
    status: 'completed',
    filePath: selection.filePath,
    bytes: received,
  };
}

import { createWriteStream } from 'node:fs';
import { access, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { embedAudioMetadata, normalizeAudioMetadata } from './audioMetadata.js';

const MAX_FILENAME_LENGTH = 240;
const MAX_BATCH_AGE = 60 * 60 * 1000;
const trackDownloadBatches = new Map();

function sanitizeSuggestedName(value) {
  const normalized = String(value || '')
    .replace(/\p{Cc}/gu, '_')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim();
  return (normalized || 'track.mp3').slice(0, MAX_FILENAME_LENGTH);
}

export function normalizeTrackDownloadRequest(payload, baseUrl) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  let url;
  try {
    url = baseUrl ? new URL(payload.url, baseUrl) : new URL(payload.url);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;

  const metadata = normalizeAudioMetadata(payload.metadata, baseUrl);
  return {
    url: url.toString(),
    suggestedName: sanitizeSuggestedName(payload.suggestedName),
    ...(metadata ? { metadata } : {}),
  };
}

function clearExpiredBatches(now = Date.now()) {
  for (const [batchId, batch] of trackDownloadBatches) {
    if (now - batch.updatedAt > MAX_BATCH_AGE) {
      trackDownloadBatches.delete(batchId);
    }
  }
}

async function createUniqueFilePath(directory, suggestedName) {
  const parsed = path.parse(sanitizeSuggestedName(suggestedName));
  const baseName = parsed.name || 'track';
  const extension = parsed.ext;

  for (let index = 1; index <= 10000; index += 1) {
    const suffix = index === 1 ? '' : ` (${index})`;
    const candidate = path.join(directory, `${baseName}${suffix}${extension}`);
    try {
      await access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error('Unable to create a unique download filename');
}

async function downloadUrlToFile({
  net,
  url,
  filePath,
  onProgress,
  acceptedContentType = /^audio\/|^(application|binary)\/octet-stream/i,
}) {
  const response = await net.fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType && !acceptedContentType.test(contentType)) {
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
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.part`
  );

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      progress,
      createWriteStream(temporaryPath, { flags: 'wx' })
    );
    await copyFile(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }

  return { bytes: received };
}

export async function saveArtworkDownload({ win, dialog, net, payload }) {
  const request = normalizeTrackDownloadRequest(
    payload,
    win?.webContents?.getURL?.()
  );
  if (!request) throw new Error('Invalid artwork download request');

  const selection = await dialog.showSaveDialog(win, {
    title: '保存歌曲封面',
    defaultPath: request.suggestedName,
    filters: [
      {
        name: 'Image',
        extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'],
      },
    ],
  });
  if (selection.canceled || !selection.filePath) {
    return { status: 'canceled' };
  }

  const result = await downloadUrlToFile({
    net,
    url: request.url,
    filePath: selection.filePath,
    acceptedContentType: /^image\/|^(application|binary)\/octet-stream/i,
  });

  return {
    status: 'completed',
    filePath: selection.filePath,
    bytes: result.bytes,
  };
}

export async function saveTrackDownload({
  win,
  dialog,
  net,
  payload,
  onProgress,
}) {
  const request = normalizeTrackDownloadRequest(
    payload,
    win?.webContents?.getURL?.()
  );
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

  const result = await downloadUrlToFile({
    net,
    url: request.url,
    filePath: selection.filePath,
    onProgress,
  });
  try {
    await embedAudioMetadata({
      filePath: selection.filePath,
      metadata: request.metadata,
      net,
    });
  } catch (error) {
    await rm(selection.filePath, { force: true }).catch(() => undefined);
    throw new Error(`Failed to write audio metadata: ${error.message}`, {
      cause: error,
    });
  }

  return {
    status: 'completed',
    filePath: selection.filePath,
    bytes: result.bytes,
  };
}

export async function beginTrackDownloadBatch({
  win,
  dialog,
  ownerId,
  playlistName,
}) {
  clearExpiredBatches();
  const selection = await dialog.showOpenDialog(win, {
    title: `选择“${sanitizeSuggestedName(playlistName || '歌单')}”的保存目录`,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (selection.canceled || !selection.filePaths?.[0]) {
    return { status: 'canceled' };
  }

  const batchId = randomUUID();
  trackDownloadBatches.set(batchId, {
    directory: selection.filePaths[0],
    ownerId,
    updatedAt: Date.now(),
  });
  return { status: 'ready', batchId };
}

export async function saveTrackDownloadToBatch({
  win,
  net,
  ownerId,
  payload,
  onProgress,
}) {
  clearExpiredBatches();
  const batchId = typeof payload?.batchId === 'string' ? payload.batchId : '';
  const batch = trackDownloadBatches.get(batchId);
  if (!batch || batch.ownerId !== ownerId) {
    throw new Error('Invalid or expired download batch');
  }
  const request = normalizeTrackDownloadRequest(
    payload,
    win?.webContents?.getURL?.()
  );
  if (!request) throw new Error('Invalid download request');

  batch.updatedAt = Date.now();
  const filePath = await createUniqueFilePath(
    batch.directory,
    request.suggestedName
  );
  const result = await downloadUrlToFile({
    net,
    url: request.url,
    filePath,
    onProgress,
  });
  try {
    await embedAudioMetadata({
      filePath,
      metadata: request.metadata,
      net,
    });
  } catch (error) {
    await rm(filePath, { force: true }).catch(() => undefined);
    throw new Error(`Failed to write audio metadata: ${error.message}`, {
      cause: error,
    });
  }
  return {
    status: 'completed',
    filename: path.basename(filePath),
    bytes: result.bytes,
  };
}

export function finishTrackDownloadBatch(ownerId, batchId) {
  const batch = trackDownloadBatches.get(batchId);
  if (!batch || batch.ownerId !== ownerId) return false;
  trackDownloadBatches.delete(batchId);
  return true;
}

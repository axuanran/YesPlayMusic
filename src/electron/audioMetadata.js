import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PictureKind, writeMetadata } from '@akabeko/music-metadata-editor';

const MAX_ARTWORK_BYTES = 20 * 1024 * 1024;
const LRC_TIMESTAMP_PATTERN = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_METADATA_PATTERN = /^\[(ar|al|ti|by|offset|re|ve):.*\]$/i;

const boundedString = (value, maxLength = 131072) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : '';

const positiveInteger = value => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};

export function normalizeAudioMetadata(value, baseUrl) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  let coverUrl = '';
  if (value.coverUrl) {
    try {
      const parsed = baseUrl
        ? new URL(value.coverUrl, baseUrl)
        : new URL(value.coverUrl);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        coverUrl = parsed.toString();
      }
    } catch {
      coverUrl = '';
    }
  }

  const metadata = {
    album: boundedString(value.album, 1024),
    albumArtist: boundedString(value.albumArtist, 1024),
    artist: boundedString(value.artist, 2048),
    coverUrl,
    discNumber: positiveInteger(value.discNumber),
    lyrics: boundedString(value.lyrics),
    publishingDate: boundedString(value.publishingDate, 32),
    title: boundedString(value.title, 2048),
    trackNumber: positiveInteger(value.trackNumber),
    translatedLyrics: boundedString(value.translatedLyrics),
  };

  return Object.values(metadata).some(Boolean) ? metadata : null;
}

export function parseSynchronizedLyrics(value) {
  const text = boundedString(value);
  if (!text) return [];
  let offset = 0;
  const offsetMatch = text.match(/^\[offset:([+-]?\d+)\]$/im);
  if (offsetMatch) offset = Number(offsetMatch[1]) || 0;
  const lines = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const timestamps = [...rawLine.matchAll(LRC_TIMESTAMP_PATTERN)];
    if (timestamps.length === 0) continue;
    const lyric = rawLine.replace(LRC_TIMESTAMP_PATTERN, '').trim();
    if (!lyric) continue;
    for (const timestamp of timestamps) {
      const fraction = timestamp[3] || '';
      const fractionMs =
        fraction.length === 3
          ? Number(fraction)
          : Number(fraction.padEnd(2, '0')) * 10;
      lines.push({
        text: lyric,
        timeMs: Math.max(
          0,
          Number(timestamp[1]) * 60000 +
            Number(timestamp[2]) * 1000 +
            fractionMs +
            offset
        ),
      });
    }
  }

  return lines.sort((left, right) => left.timeMs - right.timeMs);
}

export function stripLrcTimestamps(value) {
  return boundedString(value)
    .split(/\r?\n/)
    .map(line => line.replace(LRC_TIMESTAMP_PATTERN, '').trim())
    .filter(line => line && !LRC_METADATA_PATTERN.test(line))
    .join('\n');
}

async function fetchArtwork(net, url) {
  const response = await net.fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Artwork download failed with HTTP ${response.status}`);
  }
  const mimeType = response.headers.get('content-type')?.split(';')[0].trim();
  if (!mimeType?.startsWith('image/')) {
    throw new Error(
      `Unexpected artwork content type: ${mimeType || 'unknown'}`
    );
  }
  const declaredLength = Number(response.headers.get('content-length')) || 0;
  if (declaredLength > MAX_ARTWORK_BYTES) {
    throw new Error('Artwork exceeds the 20 MB limit');
  }
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength === 0 || data.byteLength > MAX_ARTWORK_BYTES) {
    throw new Error('Artwork is empty or exceeds the 20 MB limit');
  }
  return {
    data,
    description: 'Cover',
    kind: PictureKind.CoverFront,
    mimeType,
  };
}

async function replaceFile(filePath, bytes) {
  const directory = path.dirname(filePath);
  const filename = path.basename(filePath);
  const suffix = randomUUID();
  const temporaryPath = path.join(directory, `.${filename}.${suffix}.tagged`);
  const backupPath = path.join(directory, `.${filename}.${suffix}.backup`);
  let backupCreated = false;

  try {
    await writeFile(temporaryPath, bytes, { flag: 'wx' });
    await rename(filePath, backupPath);
    backupCreated = true;
    await rename(temporaryPath, filePath);
    await rm(backupPath, { force: true });
    backupCreated = false;
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    if (backupCreated) {
      await rename(backupPath, filePath).catch(() => undefined);
    }
    throw error;
  }
}

export async function embedAudioMetadata({
  filePath,
  metadata,
  net,
  writeMetadataFn = writeMetadata,
}) {
  const normalized = normalizeAudioMetadata(metadata);
  if (!normalized) return { status: 'skipped' };

  const synchronized = parseSynchronizedLyrics(normalized.lyrics);
  const originalLyrics = stripLrcTimestamps(normalized.lyrics);
  const translatedLyrics = stripLrcTimestamps(normalized.translatedLyrics);
  const unsynchronized = [originalLyrics, translatedLyrics]
    .filter(Boolean)
    .join('\n\n');
  const options = {
    tag: {
      album: normalized.album || undefined,
      albumArtist: normalized.albumArtist || undefined,
      artist: normalized.artist || undefined,
      discNumber: normalized.discNumber,
      publishingDate: normalized.publishingDate || undefined,
      title: normalized.title || undefined,
      trackNumber: normalized.trackNumber,
    },
  };

  if (normalized.coverUrl) {
    options.pictures = [await fetchArtwork(net, normalized.coverUrl)];
  }
  if (unsynchronized || synchronized.length > 0) {
    options.lyrics = {
      description: 'Lyrics',
      language: 'und',
      synchronized,
      unsynchronized,
    };
  }

  const bytes = await writeMetadataFn(filePath, options);
  await replaceFile(filePath, bytes);
  return { status: 'completed' };
}

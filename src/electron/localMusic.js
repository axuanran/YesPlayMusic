import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';

export const LOCAL_MUSIC_STORE_KEY = 'localMusic.tracks';
export const LOCAL_MUSIC_ID_PREFIX = 'local:';
export const LOCAL_MUSIC_EXTENSIONS = [
  'mp3',
  'flac',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'wav',
];

const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isSupportedAudioFile = filePath =>
  LOCAL_MUSIC_EXTENSIONS.includes(
    path.extname(filePath).slice(1).toLowerCase()
  );

export function createLocalMusicId(filePath) {
  const normalizedPath =
    process.platform === 'win32'
      ? path.resolve(filePath).toLowerCase()
      : path.resolve(filePath);
  const digest = createHash('sha256')
    .update(normalizedPath)
    .digest('hex')
    .slice(0, 24);
  return `${LOCAL_MUSIC_ID_PREFIX}${digest}`;
}

function normalizeArtist(metadata) {
  const artists = metadata.common?.artists?.filter(Boolean);
  if (artists?.length) return artists.join(', ');
  return (
    metadata.common?.artist || metadata.common?.albumartist || 'Unknown Artist'
  );
}

export function createLocalMusicRecord(filePath, metadata = {}) {
  const absolutePath = path.resolve(filePath);
  const duration = Number(metadata.format?.duration);
  const trackNumber = Number(metadata.common?.track?.no);

  return {
    id: createLocalMusicId(absolutePath),
    filePath: absolutePath,
    name:
      metadata.common?.title ||
      path.basename(absolutePath, path.extname(absolutePath)),
    artist: normalizeArtist(metadata),
    album: metadata.common?.album || 'Local Music',
    duration: Number.isFinite(duration) && duration > 0 ? duration * 1000 : 0,
    trackNumber:
      Number.isFinite(trackNumber) && trackNumber > 0 ? trackNumber : 0,
    hasArtwork: Boolean(metadata.common?.picture?.length),
  };
}

function getStoredRecords(store) {
  const records = store.get(LOCAL_MUSIC_STORE_KEY, []);
  if (!Array.isArray(records)) return [];
  return records.filter(
    record =>
      isRecord(record) &&
      typeof record.id === 'string' &&
      record.id.startsWith(LOCAL_MUSIC_ID_PREFIX) &&
      typeof record.filePath === 'string'
  );
}

function createResourceUrl(baseUrl, id, resource) {
  return `${baseUrl}/local-music/${encodeURIComponent(id)}/${resource}`;
}

export function toPublicLocalMusicTrack(record, baseUrl) {
  return {
    id: record.id,
    name: record.name,
    ar: [{ id: 0, name: record.artist }],
    artists: [{ id: 0, name: record.artist }],
    al: {
      id: 0,
      name: record.album,
      picUrl: record.hasArtwork
        ? createResourceUrl(baseUrl, record.id, 'artwork')
        : '',
    },
    album: {
      id: 0,
      name: record.album,
      picUrl: record.hasArtwork
        ? createResourceUrl(baseUrl, record.id, 'artwork')
        : '',
    },
    dt: record.duration,
    duration: record.duration,
    no: record.trackNumber,
    alia: [],
    tns: [],
    playable: true,
    local: true,
    sourceUrl: createResourceUrl(baseUrl, record.id, 'audio'),
  };
}

export function createLocalMusicService({
  store,
  baseUrl,
  metadataParser = parseFile,
  fileExists = fs.existsSync,
}) {
  const getBaseUrl = () =>
    typeof baseUrl === 'function' ? baseUrl() : baseUrl;
  const listRecords = () => {
    const records = getStoredRecords(store);
    const availableRecords = records.filter(record =>
      fileExists(record.filePath)
    );
    if (availableRecords.length !== records.length) {
      store.set(LOCAL_MUSIC_STORE_KEY, availableRecords);
    }
    return availableRecords;
  };

  const list = () =>
    listRecords().map(record => toPublicLocalMusicTrack(record, getBaseUrl()));

  const get = id => {
    const record = listRecords().find(item => item.id === id);
    return record ? toPublicLocalMusicTrack(record, getBaseUrl()) : null;
  };

  const importFiles = async filePaths => {
    const existingRecords = new Map(
      listRecords().map(record => [record.id, record])
    );
    let imported = 0;
    let skipped = 0;

    for (const filePath of filePaths) {
      if (!isSupportedAudioFile(filePath) || !fileExists(filePath)) {
        skipped += 1;
        continue;
      }
      try {
        const metadata = await metadataParser(filePath, { duration: true });
        const record = createLocalMusicRecord(filePath, metadata);
        existingRecords.set(record.id, record);
        imported += 1;
      } catch {
        skipped += 1;
      }
    }

    store.set(LOCAL_MUSIC_STORE_KEY, [...existingRecords.values()]);
    return { tracks: list(), imported, skipped };
  };

  const remove = ids => {
    const idSet = new Set(ids);
    store.set(
      LOCAL_MUSIC_STORE_KEY,
      getStoredRecords(store).filter(record => !idSet.has(record.id))
    );
    return list();
  };

  const getRecord = id =>
    listRecords().find(record => record.id === id) || null;

  return { get, getRecord, importFiles, list, remove };
}

export function registerLocalMusicRoutes(expressApp, service) {
  expressApp.get('/local-music/:id/audio', (request, response) => {
    const record = service.getRecord(request.params.id);
    if (!record) {
      response.sendStatus(404);
      return;
    }
    response.sendFile(record.filePath, error => {
      if (error && !response.headersSent) {
        response.sendStatus(error.status || 500);
      }
    });
  });

  expressApp.get('/local-music/:id/artwork', async (request, response) => {
    const record = service.getRecord(request.params.id);
    if (!record?.hasArtwork) {
      response.sendStatus(404);
      return;
    }
    try {
      const metadata = await parseFile(record.filePath, {
        duration: false,
        skipCovers: false,
      });
      const picture = metadata.common?.picture?.[0];
      if (!picture?.data) {
        response.sendStatus(404);
        return;
      }
      response
        .set('Content-Type', picture.format || 'image/jpeg')
        .set('Cache-Control', 'private, max-age=86400')
        .send(picture.data);
    } catch {
      response.sendStatus(404);
    }
  });
}

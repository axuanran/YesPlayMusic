import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseFile } from 'music-metadata';

export const LOCAL_MUSIC_STORE_KEY = 'localMusic.tracks';
export const LOCAL_MUSIC_FOLDERS_STORE_KEY = 'localMusic.folders';
export const LOCAL_MUSIC_ID_PREFIX = 'local:';
export const LOCAL_MUSIC_FOLDER_ID_PREFIX = 'local-folder:';
const LOOPBACK_MEDIA_ORIGIN =
  /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/;
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

export function extractEmbeddedSyncedLyrics(metadata) {
  const tags = Array.isArray(metadata?.common?.lyrics)
    ? metadata.common.lyrics
    : [];
  const tag = tags.find(
    item => Array.isArray(item?.syncText) && item.syncText.length
  );
  if (!tag) return '';

  return tag.syncText
    .filter(
      line => Number.isFinite(line?.timestamp) && typeof line?.text === 'string'
    )
    .map(line => {
      const time = Math.max(0, line.timestamp);
      const minutes = Math.floor(time / 60000);
      const seconds = Math.floor((time % 60000) / 1000);
      const centiseconds = Math.floor((time % 1000) / 10);
      return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
        2,
        '0'
      )}.${String(centiseconds).padStart(2, '0')}]${line.text}`;
    })
    .join('\n')
    .slice(0, 131072);
}

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

export function createLocalMusicFolderId(folderPath) {
  const normalizedPath =
    process.platform === 'win32'
      ? path.resolve(folderPath).toLowerCase()
      : path.resolve(folderPath);
  const digest = createHash('sha256')
    .update(normalizedPath)
    .digest('hex')
    .slice(0, 24);
  return `${LOCAL_MUSIC_FOLDER_ID_PREFIX}${digest}`;
}

function normalizeArtist(metadata) {
  const artists = metadata.common?.artists?.filter(Boolean);
  if (artists?.length) return artists.join(', ');
  return (
    metadata.common?.artist || metadata.common?.albumartist || 'Unknown Artist'
  );
}

export function createLocalMusicRecord(
  filePath,
  metadata = {},
  folderId = null,
  fileStats = {}
) {
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
    folderId,
    fileSize: Number(fileStats.size) || 0,
    modifiedAt: Number(fileStats.mtimeMs) || 0,
    embeddedLyrics: extractEmbeddedSyncedLyrics(metadata),
    metadataVersion: 2,
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

function getStoredFolders(store) {
  const folders = store.get(LOCAL_MUSIC_FOLDERS_STORE_KEY, []);
  if (!Array.isArray(folders)) return [];
  return folders.filter(
    folder =>
      isRecord(folder) &&
      typeof folder.id === 'string' &&
      folder.id.startsWith(LOCAL_MUSIC_FOLDER_ID_PREFIX) &&
      typeof folder.path === 'string' &&
      typeof folder.name === 'string'
  );
}

async function scanAudioFiles(folderPath) {
  const files = [];
  const pendingDirectories = [folderPath];

  while (pendingDirectories.length) {
    const directory = pendingDirectories.pop();
    const entries = await fs.promises.readdir(directory, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
      } else if (
        (entry.isFile() || entry.isSymbolicLink()) &&
        isSupportedAudioFile(entryPath)
      ) {
        files.push(entryPath);
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function createResourceUrl(baseUrl, id, resource) {
  return `${baseUrl}/local-music/${encodeURIComponent(id)}/${resource}`;
}

export function getAllowedLocalMediaOrigin(origin) {
  return typeof origin === 'string' && LOOPBACK_MEDIA_ORIGIN.test(origin)
    ? origin
    : null;
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
    localFolderId: record.folderId || null,
    localLyrics:
      typeof record.embeddedLyrics === 'string' ? record.embeddedLyrics : '',
    sourceUrl: createResourceUrl(baseUrl, record.id, 'audio'),
  };
}

export function createLocalMusicService({
  store,
  baseUrl,
  metadataParser = parseFile,
  fileExists = fs.existsSync,
  folderScanner = scanAudioFiles,
  fileStat = filePath => fs.promises.stat(filePath),
  watchFactory = (folderPath, listener) =>
    fs.watch(folderPath, { recursive: true }, listener),
}) {
  const watchers = new Map();
  const refreshTimers = new Map();
  const refreshJobs = new Map();
  const changeListeners = new Set();
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
        const stats = await fileStat(filePath);
        const record = createLocalMusicRecord(filePath, metadata, null, stats);
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

  const notifyChange = folderId => {
    for (const listener of changeListeners) {
      listener({ folderId });
    }
  };

  const listFolders = () => {
    const records = getStoredRecords(store);
    return getStoredFolders(store).map(folder => {
      const folderRecords = records.filter(
        record => record.folderId === folder.id
      );
      const firstTrack = folderRecords[0];
      return {
        ...folder,
        available: fileExists(folder.path),
        trackCount: folderRecords.length,
        coverUrl: firstTrack?.hasArtwork
          ? createResourceUrl(getBaseUrl(), firstTrack.id, 'artwork')
          : '',
        coverUpdatedAt: firstTrack?.modifiedAt || 0,
        active: watchers.has(folder.id),
      };
    });
  };

  const getFolder = folderId => {
    const folder = listFolders().find(item => item.id === folderId);
    if (!folder) return null;
    return {
      ...folder,
      tracks: listRecords()
        .filter(record => record.folderId === folderId)
        .map(record => toPublicLocalMusicTrack(record, getBaseUrl())),
    };
  };

  const refreshFolderNow = async folderId => {
    const folder = getStoredFolders(store).find(item => item.id === folderId);
    if (!folder || !fileExists(folder.path)) {
      return getFolder(folderId);
    }

    const records = getStoredRecords(store);
    const currentRecords = new Map(
      records
        .filter(record => record.folderId === folderId)
        .map(record => [path.resolve(record.filePath), record])
    );
    const nextRecords = [];
    const filePaths = await folderScanner(folder.path);

    for (const filePath of filePaths) {
      try {
        const absolutePath = path.resolve(filePath);
        const stats = await fileStat(absolutePath);
        const current = currentRecords.get(absolutePath);
        if (
          current &&
          current.metadataVersion === 2 &&
          current.fileSize === Number(stats.size) &&
          current.modifiedAt === Number(stats.mtimeMs)
        ) {
          nextRecords.push(current);
          continue;
        }
        const metadata = await metadataParser(absolutePath, {
          duration: true,
        });
        nextRecords.push(
          createLocalMusicRecord(absolutePath, metadata, folderId, stats)
        );
      } catch {
        // A file may disappear while the directory is being scanned.
      }
    }

    const previousIds = [...currentRecords.values()]
      .map(record => record.id)
      .sort();
    const nextIds = nextRecords.map(record => record.id).sort();
    const changed =
      previousIds.length !== nextIds.length ||
      previousIds.some((id, index) => id !== nextIds[index]) ||
      nextRecords.some(record => {
        const previous = currentRecords.get(path.resolve(record.filePath));
        return (
          !previous ||
          previous.fileSize !== record.fileSize ||
          previous.modifiedAt !== record.modifiedAt
        );
      });

    store.set(LOCAL_MUSIC_STORE_KEY, [
      ...records.filter(record => record.folderId !== folderId),
      ...nextRecords,
    ]);
    if (changed) notifyChange(folderId);
    return getFolder(folderId);
  };

  const refreshFolder = folderId => {
    const previousJob = refreshJobs.get(folderId) || Promise.resolve();
    const nextJob = previousJob
      .catch(() => undefined)
      .then(() => refreshFolderNow(folderId))
      .finally(() => {
        if (refreshJobs.get(folderId) === nextJob) {
          refreshJobs.delete(folderId);
        }
      });
    refreshJobs.set(folderId, nextJob);
    return nextJob;
  };

  const scheduleRefresh = folderId => {
    clearTimeout(refreshTimers.get(folderId));
    refreshTimers.set(
      folderId,
      setTimeout(() => {
        refreshTimers.delete(folderId);
        void refreshFolder(folderId);
      }, 300)
    );
  };

  const activateFolder = async folderId => {
    const folder = await refreshFolder(folderId);
    if (!folder || watchers.has(folderId)) return folder;
    try {
      const watcher = watchFactory(folder.path, () =>
        scheduleRefresh(folderId)
      );
      watcher.on?.('error', () => {
        watcher.close();
        watchers.delete(folderId);
      });
      watchers.set(folderId, watcher);
    } catch {
      // The next open/play action will reconcile unsupported watchers.
    }
    return getFolder(folderId);
  };

  const deactivateFolder = folderId => {
    clearTimeout(refreshTimers.get(folderId));
    refreshTimers.delete(folderId);
    watchers.get(folderId)?.close();
    watchers.delete(folderId);
  };

  const addFolders = async folderPaths => {
    const folders = new Map(
      getStoredFolders(store).map(folder => [folder.id, folder])
    );
    let added = 0;
    let skipped = 0;

    for (const folderPath of folderPaths) {
      const absolutePath = path.resolve(folderPath);
      if (!fileExists(absolutePath)) {
        skipped += 1;
        continue;
      }
      const id = createLocalMusicFolderId(absolutePath);
      if (!folders.has(id)) added += 1;
      folders.set(id, {
        id,
        path: absolutePath,
        name: path.basename(absolutePath),
        addedAt: folders.get(id)?.addedAt || Date.now(),
      });
    }

    store.set(LOCAL_MUSIC_FOLDERS_STORE_KEY, [...folders.values()]);
    for (const folderPath of folderPaths) {
      const id = createLocalMusicFolderId(folderPath);
      if (folders.has(id)) await refreshFolder(id);
    }
    return { folders: listFolders(), added, skipped };
  };

  const removeFolder = folderId => {
    deactivateFolder(folderId);
    store.set(
      LOCAL_MUSIC_FOLDERS_STORE_KEY,
      getStoredFolders(store).filter(folder => folder.id !== folderId)
    );
    store.set(
      LOCAL_MUSIC_STORE_KEY,
      getStoredRecords(store).filter(record => record.folderId !== folderId)
    );
    notifyChange(folderId);
    return listFolders();
  };

  const onChange = listener => {
    changeListeners.add(listener);
    return () => changeListeners.delete(listener);
  };

  const dispose = () => {
    for (const folderId of watchers.keys()) deactivateFolder(folderId);
    changeListeners.clear();
  };

  return {
    activateFolder,
    addFolders,
    deactivateFolder,
    dispose,
    get,
    getFolder,
    getRecord,
    importFiles,
    list,
    listFolders,
    onChange,
    refreshFolder,
    remove,
    removeFolder,
  };
}

export function registerLocalMusicRoutes(expressApp, service) {
  expressApp.use('/local-music', (request, response, next) => {
    const allowedOrigin = getAllowedLocalMediaOrigin(request.get('Origin'));
    if (!allowedOrigin) {
      next();
      return;
    }

    response
      .set('Access-Control-Allow-Origin', allowedOrigin)
      .set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
      .set('Access-Control-Allow-Headers', 'Range')
      .set(
        'Access-Control-Expose-Headers',
        'Accept-Ranges, Content-Length, Content-Range'
      )
      .set('Cross-Origin-Resource-Policy', 'cross-origin')
      .vary('Origin');

    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }
    next();
  });

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

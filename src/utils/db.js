import axios from 'axios';
import Dexie from 'dexie';
import store from '@/store';
import { isElectron } from '@/utils/env';
import { createTrackCacheManager } from '@/utils/trackCacheManager';
import { toNumericDatabaseKey } from '@/utils/dbCacheKey';
// import pkg from "../../package.json";

const db = new Dexie('yesplaymusic');

db.version(4).stores({
  trackDetail: '&id, updateTime',
  lyric: '&id, updateTime',
  album: '&id, updateTime',
});

db.version(3)
  .stores({
    trackSources: '&id, createTime',
  })
  .upgrade(tx =>
    tx
      .table('trackSources')
      .toCollection()
      .modify(
        track => !track.createTime && (track.createTime = new Date().getTime())
      )
  );

db.version(1).stores({
  trackSources: '&id',
});

const logCacheError = (operation, error) => {
  console.error(`[track-cache] ${operation} failed`, error);
};

const trackCacheManager = createTrackCacheManager({
  table: db.trackSources,
  getCacheLimit: () => store.state?.settings?.cacheLimit ?? false,
  onError: logCacheError,
});
const trackCacheChangeListeners = new Set();

const notifyTrackCacheChanged = state => {
  for (const listener of trackCacheChangeListeners) listener(state);
};

export function onTrackCacheChanged(listener) {
  if (typeof listener !== 'function') return () => {};
  trackCacheChangeListeners.add(listener);
  return () => trackCacheChangeListeners.delete(listener);
}

// 等待 settings 可用
async function waitForSettingsReady(timeoutMs = 5000) {
  const interval = 100;
  const maxTries = Math.ceil(timeoutMs / interval);
  let tries = 0;
  while (
    (store.state == null ||
      store.state.settings == null ||
      store.state.settings.cacheLimit === undefined) &&
    tries < maxTries
  ) {
    await new Promise(resolve => setTimeout(resolve, interval));
    tries++;
  }
  return store.state && store.state.settings;
}

// 初始化现有缓存总大小，确保应用启动时能正确判断并清理超限缓存
async function initTracksCacheBytes() {
  if (!isElectron) return;
  try {
    await waitForSettingsReady();
    const result = await trackCacheManager.initialize();
    if (result.deleted > 0) {
      console.info(
        `[track-cache] startup eviction removed ${result.deleted} tracks; ` +
          `${result.bytes} logical bytes remain`
      );
    }
  } catch (error) {
    logCacheError('startup initialization', error);
  }
}

setTimeout(initTracksCacheBytes, 0);

export function enforceTrackCacheLimit(limitMiB) {
  return trackCacheManager.enforceLimit(limitMiB);
}

export function cacheTrackSource(trackInfo, url, bitRate, from = 'netease') {
  if (!isElectron) return;
  const trackId = toNumericDatabaseKey(trackInfo.id);
  if (trackId === null) return;
  const name = trackInfo.name;
  const artist =
    (trackInfo.ar && trackInfo.ar[0]?.name) ||
    (trackInfo.artists && trackInfo.artists[0]?.name) ||
    'Unknown';
  let cover = trackInfo.al?.picUrl || trackInfo.album?.picUrl || '';
  if (cover.startsWith('http:')) cover = `https:${cover.slice(5)}`;
  const cacheCover = size => {
    if (!cover) return;
    axios.get(`${cover}?param=${size}y${size}`).catch(error => {
      logCacheError(`cover ${size}px request`, error);
    });
  };
  cacheCover(512);
  cacheCover(224);
  cacheCover(1024);
  return axios
    .get(url, {
      responseType: 'arraybuffer',
    })
    .then(async response => {
      const cacheState = await trackCacheManager.put({
        id: trackId,
        source: response.data,
        bitRate,
        from,
        name,
        artist,
        createTime: new Date().getTime(),
      });
      notifyTrackCacheChanged(cacheState);
      return {
        trackID: trackInfo.id,
        source: response.data,
        bitRate,
        cacheState,
      };
    });
}

export function getTrackSource(id) {
  const key = toNumericDatabaseKey(id);
  if (key === null) return Promise.resolve(null);
  return db.trackSources.get(key).then(track => {
    if (!track) return null;
    return track;
  });
}

export function cacheTrackDetail(track, privileges) {
  db.trackDetail.put({
    id: track.id,
    detail: track,
    privileges: privileges,
    updateTime: new Date().getTime(),
  });
}

export function getTrackDetailFromCache(ids) {
  return db.trackDetail
    .filter(track => {
      return ids.includes(String(track.id));
    })
    .toArray()
    .then(tracks => {
      const result = { songs: [], privileges: [] };
      ids.map(id => {
        const one = tracks.find(t => String(t.id) === id);
        result.songs.push(one?.detail);
        result.privileges.push(one?.privileges);
      });
      if (result.songs.includes(undefined)) {
        return undefined;
      }
      return result;
    });
}

export function cacheLyric(id, lyrics) {
  const key = toNumericDatabaseKey(id);
  if (key === null) return;
  db.lyric.put({
    id: key,
    lyrics,
    updateTime: new Date().getTime(),
  });
}

export function getLyricFromCache(id) {
  const key = toNumericDatabaseKey(id);
  if (key === null) return Promise.resolve(undefined);
  return db.lyric.get(key).then(result => {
    if (!result) return undefined;
    return result.lyrics;
  });
}

export function cacheAlbum(id, album) {
  const key = toNumericDatabaseKey(id);
  if (key === null) return;
  db.album.put({
    id: key,
    album,
    updateTime: new Date().getTime(),
  });
}

export function getAlbumFromCache(id) {
  const key = toNumericDatabaseKey(id);
  if (key === null) return Promise.resolve(undefined);
  return db.album.get(key).then(result => {
    if (!result) return undefined;
    return result.album;
  });
}

export function countDBSize() {
  return trackCacheManager.count();
}

export async function listCachedTracks() {
  const ids = await trackCacheManager.listIds();
  const details = await db.trackDetail.bulkGet(ids);
  return ids.map((id, index) => {
    const track = details[index]?.detail;
    return {
      id,
      name: track?.name || `#${id}`,
      artists: (track?.ar || track?.artists || [])
        .map(artist => artist?.name)
        .filter(Boolean),
      album: track?.al?.name || track?.album?.name || '',
      cover: track?.al?.picUrl || track?.album?.picUrl || '',
    };
  });
}

export async function removeCachedTrack(id) {
  const key = toNumericDatabaseKey(id);
  if (key === null) return null;
  const state = await trackCacheManager.remove(key);
  notifyTrackCacheChanged(state);
  return state;
}

export function clearDB() {
  return trackCacheManager.clearAll(db.tables);
}

export function clearAllDiskCache(clearDiskCache) {
  return trackCacheManager.clearAllDiskCache(db.tables, {
    closeDatabase: () => db.close(),
    clearDiskCache,
    openDatabase: () => db.open(),
  });
}

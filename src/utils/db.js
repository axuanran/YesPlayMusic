import axios from 'axios';
import Dexie from 'dexie';
import store from '@/store';
import { isElectron } from '@/utils/env';
import { createTrackCacheManager } from '@/utils/trackCacheManager';
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
  const name = trackInfo.name;
  const artist =
    (trackInfo.ar && trackInfo.ar[0]?.name) ||
    (trackInfo.artists && trackInfo.artists[0]?.name) ||
    'Unknown';
  let cover = trackInfo.al.picUrl;
  if (cover.slice(0, 5) !== 'https') {
    cover = 'https' + cover.slice(4);
  }
  const cacheCover = size => {
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
      await trackCacheManager.put({
        id: trackInfo.id,
        source: response.data,
        bitRate,
        from,
        name,
        artist,
        createTime: new Date().getTime(),
      });
      return { trackID: trackInfo.id, source: response.data, bitRate };
    });
}

export function getTrackSource(id) {
  return db.trackSources.get(Number(id)).then(track => {
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
  db.lyric.put({
    id,
    lyrics,
    updateTime: new Date().getTime(),
  });
}

export function getLyricFromCache(id) {
  return db.lyric.get(Number(id)).then(result => {
    if (!result) return undefined;
    return result.lyrics;
  });
}

export function cacheAlbum(id, album) {
  db.album.put({
    id: Number(id),
    album,
    updateTime: new Date().getTime(),
  });
}

export function getAlbumFromCache(id) {
  return db.album.get(Number(id)).then(result => {
    if (!result) return undefined;
    return result.album;
  });
}

export function countDBSize() {
  return trackCacheManager.count();
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

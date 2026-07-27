import { getMP3, getTrackDetail } from '@/api/track';
import { isAccountLoggedIn } from '@/utils/auth';
import { cacheTrackSource, getTrackSource } from '@/utils/db';
import {
  getOuterAudioUrl,
  resolveTrackSource,
} from '@/utils/resolveAudioSource';

function getRuntimeStore() {
  return globalThis?.yesplaymusicStore || null;
}

const pendingTrackCaches = new Set();

function isCacheableOnlineSource(source) {
  return (
    typeof source === 'string' &&
    (/^https?:\/\//i.test(source) || source.startsWith('/'))
  );
}

function getLocalMusicApi() {
  return globalThis?.window?.electronAPI?.localMusic || null;
}

function getStreamingApi() {
  return globalThis?.window?.electronAPI?.streaming || null;
}

export function isLocalMusicTrackId(trackId) {
  return typeof trackId === 'string' && trackId.startsWith('local:');
}

export function isStreamingTrackId(trackId) {
  return typeof trackId === 'string' && trackId.startsWith('stream:');
}

export function isCanceledRequest(error) {
  return error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED';
}

export default class PlayerResolver {
  constructor({ createBlobUrl } = {}) {
    this.createBlobUrl = createBlobUrl;
  }

  loadTrack(trackId, options = {}) {
    if (isLocalMusicTrackId(trackId)) {
      const localMusicApi = getLocalMusicApi();
      if (!localMusicApi?.get) {
        return Promise.reject(new Error('Local music is unavailable'));
      }
      return localMusicApi.get(trackId).then(track => {
        if (!track) throw new Error('Local music file is unavailable');
        return track;
      });
    }
    if (isStreamingTrackId(trackId)) {
      const streamingApi = getStreamingApi();
      if (!streamingApi?.getTrack) {
        return Promise.reject(new Error('Streaming is unavailable'));
      }
      return streamingApi.getTrack(trackId).then(track => {
        if (!track) throw new Error('Streaming track is unavailable');
        return track;
      });
    }
    return getTrackDetail(trackId, options).then(data => data.songs[0]);
  }

  resolveSource(track, options = {}) {
    if (track?.local === true) {
      const localMusicApi = getLocalMusicApi();
      if (!localMusicApi?.get) return Promise.resolve(track.sourceUrl || null);
      return localMusicApi
        .get(track.id)
        .then(currentTrack => currentTrack?.sourceUrl || null);
    }
    if (track?.streaming === true) {
      const streamingApi = getStreamingApi();
      if (!streamingApi?.getTrack) {
        return Promise.resolve(track.sourceUrl || null);
      }
      return streamingApi
        .getTrack(track.id)
        .then(currentTrack => currentTrack?.sourceUrl || null);
    }
    return this.resolveCachedSource(String(track.id)).then(cachedSource => {
      if (cachedSource) return cachedSource;
      return resolveTrackSource(track, options)
        .then(source => {
          this.cacheResolvedSource(track, source, undefined, 'resolver');
          return source;
        })
        .catch(error => {
          if (isCanceledRequest(error)) throw error;
          return this.resolveLegacySource(track, options);
        });
    });
  }

  resolveLegacySource(track, options = {}) {
    return this.resolveNeteaseSource(track, options);
  }

  resolveCachedSource(id) {
    return getTrackSource(id).then(track => {
      if (!track || !this.createBlobUrl) return null;
      return this.createBlobUrl(track.source);
    });
  }

  resolveNeteaseSource(track, options = {}) {
    if (!isAccountLoggedIn()) {
      const source = getOuterAudioUrl(track.id);
      this.cacheResolvedSource(track, source, undefined, 'outer');
      return Promise.resolve(source);
    }

    return getMP3(track.id, options)
      .then(result => {
        if (!result.data[0]) return null;
        if (!result.data[0].url) return null;
        if (result.data[0].freeTrialInfo !== null) return null;
        const source = result.data[0].url.replace(/^http:/, 'https:');
        this.cacheResolvedSource(track, source, result.data[0].br, 'netease');
        return source;
      })
      .catch(error => {
        if (isCanceledRequest(error)) throw error;
        return null;
      });
  }

  cacheResolvedSource(track, source, bitRate, from) {
    if (
      !getRuntimeStore()?.state?.settings?.automaticallyCacheSongs ||
      !Number.isFinite(Number(track?.id)) ||
      !isCacheableOnlineSource(source)
    ) {
      return;
    }
    const cacheKey = String(track.id);
    if (pendingTrackCaches.has(cacheKey)) return;
    pendingTrackCaches.add(cacheKey);
    Promise.resolve(cacheTrackSource(track, source, bitRate, from))
      .catch(error => {
        console.error(`[track-cache] failed to cache track ${track.id}`, error);
      })
      .finally(() => pendingTrackCaches.delete(cacheKey));
  }
}

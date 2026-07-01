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

export function isCanceledRequest(error) {
  return error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED';
}

export default class PlayerResolver {
  constructor({ createBlobUrl } = {}) {
    this.createBlobUrl = createBlobUrl;
  }

  loadTrack(trackId, options = {}) {
    return getTrackDetail(trackId, options).then(data => data.songs[0]);
  }

  resolveSource(track, options = {}) {
    return resolveTrackSource(track, options).catch(error => {
      if (isCanceledRequest(error)) throw error;
      return this.resolveLegacySource(track, options);
    });
  }

  resolveLegacySource(track, options = {}) {
    return this.resolveCachedSource(String(track.id)).then(source => {
      return source ?? this.resolveNeteaseSource(track, options);
    });
  }

  resolveCachedSource(id) {
    return getTrackSource(id).then(track => {
      if (!track || !this.createBlobUrl) return null;
      return this.createBlobUrl(track.source);
    });
  }

  resolveNeteaseSource(track, options = {}) {
    if (!isAccountLoggedIn()) {
      return Promise.resolve(getOuterAudioUrl(track.id));
    }

    return getMP3(track.id, options)
      .then(result => {
        if (!result.data[0]) return null;
        if (!result.data[0].url) return null;
        if (result.data[0].freeTrialInfo !== null) return null;
        const source = result.data[0].url.replace(/^http:/, 'https:');
        if (getRuntimeStore()?.state?.settings?.automaticallyCacheSongs) {
          cacheTrackSource(track, source, result.data[0].br);
        }
        return source;
      })
      .catch(error => {
        if (isCanceledRequest(error)) throw error;
        return null;
      });
  }
}

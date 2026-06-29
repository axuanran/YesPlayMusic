import UNM from '@unblockneteasemusic/rust-napi';
import axios from 'axios';
import { Buffer } from 'node:buffer';

const NETEASE_API_BASE = 'http://127.0.0.1:10754';
const DEFAULT_SOURCE = ['ytdl', 'bilibili', 'pyncm', 'kugou'];

export const providerName = 'unblock';

let executor = null;

/**
 * @param {number} trackId
 * @param {{ track?: object, unblock?: object }} context
 * @returns {Promise<{ok: boolean, url?: string, mime?: string, quality?: string, source?: string, expiresAt?: number, errorCode?: string, errorMessage?: string}>}
 */
export async function resolve(trackId, context = {}) {
  const options = context.unblock || {};
  if (options.enabled === false) {
    return {
      ok: false,
      errorCode: 'PROVIDER_DISABLED',
      errorMessage: 'UnblockNeteaseMusic 未启用',
    };
  }

  try {
    const song =
      normalizeTrack(context.track) || (await fetchTrackDetail(trackId));
    if (!song) {
      return {
        ok: false,
        errorCode: 'TRACK_NOT_FOUND',
        errorMessage: '无法获取歌曲信息',
      };
    }

    const unm = getExecutor();
    const sourceList = parseSourceList(unm, options.source);
    const unmContext = buildUnblockContext(options);
    const matchedAudio = await unm.search(sourceList, song, unmContext);
    const retrievedSong = await unm.retrieve(matchedAudio, unmContext);

    if (!retrievedSong?.url) {
      return {
        ok: false,
        errorCode: 'NO_SOURCE',
        errorMessage: '没有可用音源',
      };
    }

    const isBilibili =
      retrievedSong.source === 'bilibili' ||
      retrievedSong.url.includes('bilivideo.com');
    const url = isBilibili
      ? await getBiliVideoDataUrl(retrievedSong.url)
      : String(retrievedSong.url).replace(/^http:/, 'https:');

    return {
      ok: true,
      url,
      mime: isBilibili ? 'audio/mpeg' : getMimeFromUrl(url),
      quality: context.quality || 'standard',
      source: `unblock:${retrievedSong.source || 'unknown'}`,
      urlExt: isBilibili ? 'mp3' : getUrlExt(url),
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: 'PROVIDER_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function getExecutor() {
  if (!executor) {
    executor = new UNM.Executor();
  }
  return executor;
}

function parseSourceList(unm, sourceString) {
  const available = unm.list();
  const requested =
    typeof sourceString === 'string'
      ? sourceString
          .split(',')
          .map(s => s.trim().toLowerCase())
          .filter(Boolean)
      : DEFAULT_SOURCE;
  const filtered = requested.filter(source => available.includes(source));
  return filtered.length > 0
    ? filtered
    : DEFAULT_SOURCE.filter(source => available.includes(source));
}

function buildUnblockContext(options) {
  return {
    enableFlac: options.enableFlac || null,
    proxyUri: options.proxyUri || null,
    searchMode: normalizeSearchMode(options.searchMode),
    config: {
      'joox:cookie': options.jooxCookie || null,
      'qq:cookie': options.qqCookie || null,
      'ytdl:exe': options.ytDlExe || null,
    },
  };
}

function normalizeSearchMode(searchMode) {
  if (searchMode === 1 || searchMode === 'order-first') return 1;
  return 0;
}

async function fetchTrackDetail(trackId) {
  const response = await axios.get(`${NETEASE_API_BASE}/song/detail`, {
    params: { ids: `[${trackId}]` },
    timeout: 10000,
  });
  return normalizeTrack(response.data?.songs?.[0]);
}

function normalizeTrack(track) {
  if (!track || typeof track !== 'object') return null;
  return {
    id: track.id && String(track.id),
    name: track.name,
    duration: track.dt || track.duration,
    album:
      track.al || track.album
        ? {
            id:
              (track.al?.id || track.album?.id) &&
              String(track.al?.id || track.album?.id),
            name: track.al?.name || track.album?.name,
          }
        : undefined,
    artists: Array.isArray(track.ar || track.artists)
      ? (track.ar || track.artists).map(({ id, name }) => ({
          id: id && String(id),
          name,
        }))
      : [],
  };
}

async function getBiliVideoDataUrl(url) {
  const response = await axios.get(url, {
    headers: {
      Referer: 'https://www.bilibili.com/',
      'User-Agent': 'okhttp/3.4.1',
    },
    responseType: 'arraybuffer',
    timeout: 20000,
  });
  const base64 = Buffer.from(response.data).toString('base64');
  return `data:application/octet-stream;base64,${base64}`;
}

function getMimeFromUrl(url) {
  const ext = getUrlExt(url);
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'm4a') return 'audio/mp4';
  return 'audio/mpeg';
}

function getUrlExt(url) {
  try {
    const clean = String(url).split('?')[0];
    const index = clean.lastIndexOf('.');
    return index >= 0 ? clean.slice(index + 1).toLowerCase() : '';
  } catch {
    return '';
  }
}

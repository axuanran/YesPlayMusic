import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { Buffer } from 'node:buffer';
import CryptoJS from 'crypto-js';

const NETEASE_API_BASE = 'http://127.0.0.1:10754';
const DEFAULT_SOURCE = 'kw';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CACHE_MS = 10 * 60 * 1000;
const UNHANDLED_REJECTION_HANDLER = Symbol.for(
  'yesplaymusic.lx.unhandledRejectionHandler'
);
const LEVEL_MAP = {
  standard: '128k',
  exhigh: '320k',
  lossless: 'flac',
  hires: 'flac24bit',
  jyeffect: 'flac',
  sky: 'flac',
  jymaster: 'flac24bit',
};

export const providerName = 'lx';

const runtimeCache = new Map();
installUnhandledRejectionHandler();

function installUnhandledRejectionHandler() {
  if (process[UNHANDLED_REJECTION_HANDLER]) return;
  process[UNHANDLED_REJECTION_HANDLER] = true;
  process.on('unhandledRejection', error => {
    console.warn(
      '[resolver:lx] unhandled source rejection:',
      error instanceof Error ? error.message : error
    );
  });
}

/**
 * Resolve through an LX Music custom source script.
 *
 * Configure audio.lx.scriptUrl with a remote custom source JS URL.
 * audio.lx.scriptPath is kept only for legacy configs.
 */
export async function resolve(trackId, context = {}) {
  const options = context.lx || {};
  if (options.enabled === false) {
    return disabled();
  }

  const sources = getSourceConfigs(options);
  if (sources.length === 0) {
    return {
      ok: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
        errorMessage: '洛雪音源未配置 sources 或 scriptUrl',
    };
  }

  try {
    const track =
      normalizeTrack(context.track, trackId) || (await fetchTrackDetail(trackId));
    if (!track) {
      return {
        ok: false,
        errorCode: 'TRACK_NOT_FOUND',
        errorMessage: '无法获取歌曲信息，请在 Test Resolve 填写 Song Name',
      };
    }

    const tried = [];
    for (const sourceConfig of sources) {
      try {
        const runtime = await getRuntime(sourceConfig);
        const quality = normalizeQuality(context.quality);
        const source = sourceConfig.source || DEFAULT_SOURCE;
        const musicInfo = toLxMusicInfo(track, source);
        const urlInfo = await requestMusicUrl(runtime, {
          source,
          musicInfo,
          quality,
          timeoutMs: sourceConfig.timeoutMs || DEFAULT_TIMEOUT_MS,
        });

        const url = normalizeUrl(urlInfo);
        if (!url) {
          tried.push(`${sourceConfig.name || source}:NO_SOURCE`);
          continue;
        }

        return {
          ok: true,
          url,
          mime: getMimeFromUrl(url),
          quality: context.quality || 'standard',
          source: `lx:${sourceConfig.name || source}`,
          br: getBitrate(quality),
          urlExt: getUrlExt(url),
          expiresAt: Date.now() + (sourceConfig.expiresInMs || 30 * 60 * 1000),
        };
      } catch (error) {
        tried.push(
          `${sourceConfig.name || sourceConfig.source || 'unknown'}:${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    return {
      ok: false,
      errorCode: 'NO_SOURCE',
      errorMessage: tried.length
        ? `没有可用洛雪音源：${tried.join('; ')}`
        : '没有可用洛雪音源',
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: 'PROVIDER_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function disabled() {
  return {
    ok: false,
    errorCode: 'PROVIDER_DISABLED',
    errorMessage: '洛雪音源未启用',
  };
}

function getSourceConfigs(options) {
  const common = {
    timeoutMs: options.timeoutMs,
    cacheMs: options.cacheMs,
    vmTimeoutMs: options.vmTimeoutMs,
    expiresInMs: options.expiresInMs,
  };
  const sources = Array.isArray(options.sources)
    ? options.sources
        .filter(item => item && item.enabled !== false)
        .map((item, index) => ({
          ...common,
          ...item,
          name: item.name || item.source || `source-${index + 1}`,
          source: item.source || options.source || DEFAULT_SOURCE,
        }))
    : [];

  if (sources.length > 0) return sources;
  if (options.scriptUrl || options.scriptPath) {
    return [
      {
        ...common,
        name: options.name || options.source || DEFAULT_SOURCE,
        source: options.source || DEFAULT_SOURCE,
        scriptUrl: options.scriptUrl || '',
        scriptPath: options.scriptPath || '',
      },
    ];
  }
  return [];
}

async function getRuntime(options) {
  const cacheKey = JSON.stringify({
    scriptUrl: options.scriptUrl || '',
    scriptPath: options.scriptPath || '',
  });
  const now = Date.now();
  const cached = runtimeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.runtime;
  }

  const code = await loadSourceCode(options);
  const runtime = createRuntime();
  vm.runInNewContext(code, runtime.sandbox, {
    filename: options.scriptPath || options.scriptUrl || 'lx-source.js',
    timeout: options.vmTimeoutMs || 5000,
  });
  await runtime.waitForInit(options.timeoutMs || DEFAULT_TIMEOUT_MS);

  runtimeCache.set(cacheKey, {
    runtime,
    expiresAt: now + (options.cacheMs || DEFAULT_CACHE_MS),
  });
  return runtime;
}

async function loadSourceCode(options) {
  if (options.scriptPath) {
    const filePath = path.resolve(options.scriptPath);
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      if (!options.scriptUrl) throw error;
    }
  }

  if (!options.scriptUrl) {
    throw new Error('洛雪音源未配置 scriptUrl');
  }

  const scriptUrl = String(options.scriptUrl).trim();
  if (!isHttpUrl(scriptUrl)) {
    const filePath = scriptUrl.startsWith('file://')
      ? new URL(scriptUrl)
      : path.resolve(scriptUrl);
    return fs.readFile(filePath, 'utf-8');
  }

  const response = await axios.get(scriptUrl, {
    responseType: 'text',
    timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    transformResponse: data => data,
  });
  return String(response.data || '');
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function createRuntime() {
  const listeners = new Map();
  let initResolve;
  const initPromise = new Promise(resolve => {
    initResolve = resolve;
  });
  let initReject;
  const initErrorPromise = new Promise((_, reject) => {
    initReject = reject;
  });

  const lx = {
    EVENT_NAMES: {
      inited: 'inited',
      sources: 'sources',
      request: 'request',
      musicUrl: 'musicUrl',
      updateAlert: 'updateAlert',
    },
    env: 'desktop',
    version: '2.0.0',
    currentScriptInfo: {
      name: 'YesPlayMusic',
      version: '1',
      rawScript: '',
    },
    utils: {
      crypto: {
        md5(value) {
          return CryptoJS.MD5(String(value)).toString();
        },
      },
      buffer: {
        from(value) {
          return Buffer.from(String(value));
        },
        bufToString(value, encoding = 'utf-8') {
          return Buffer.from(value).toString(encoding);
        },
      },
    },
    on(eventName, listener) {
      listeners.set(eventName, listener);
    },
    send(eventName, payload) {
      if (eventName === 'inited') {
        initResolve(payload);
      }
    },
    request(target, payload, callback) {
      if (typeof callback === 'function') {
        return requestHttp(target, payload, callback);
      }
      const listener = listeners.get(target);
      if (!listener) {
        return Promise.reject(new Error(`LX source missing handler: ${target}`));
      }
      return Promise.resolve(listener(payload));
    },
  };

  const sandbox = {
    globalThis: null,
    lx,
    console,
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Buffer,
    CryptoJS,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    fetch: (...args) => fetch(...args),
  };
  sandbox.globalThis = sandbox;

  return {
    sandbox,
    request: lx.request,
    waitForInit(timeoutMs) {
      return withTimeout(
        Promise.race([initPromise, initErrorPromise]),
        timeoutMs,
        '洛雪音源初始化超时'
      );
    },
    failInit: initReject,
  };
}

async function requestMusicUrl(runtime, payload) {
  const result = await withTimeout(
    runtime.request('request', {
      source: payload.source,
      action: 'musicUrl',
      info: {
        musicInfo: payload.musicInfo,
        type: payload.quality,
      },
    }),
    payload.timeoutMs,
    '洛雪音源解析超时'
  );
  return result;
}

async function requestHttp(url, options = {}, callback) {
  try {
    const response = await axios({
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      data: options.body,
      timeout: options.timeout || DEFAULT_TIMEOUT_MS,
      transformResponse: data => {
        try {
          return JSON.parse(data);
        } catch {
          return data;
        }
      },
    });
    callback(
      null,
      { statusCode: response.status, body: response.data },
      response.data
    );
  } catch (error) {
    callback(error);
  }
}

async function fetchTrackDetail(trackId) {
  const endpoints = [
    {
      url: `${NETEASE_API_BASE}/song/detail`,
      params: { ids: String(trackId) },
    },
    {
      url: 'https://music.163.com/api/song/detail/',
      params: { id: String(trackId), ids: `[${trackId}]` },
    },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint.url, {
        params: endpoint.params,
        timeout: 10000,
        headers: {
          Referer: 'https://music.163.com/',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      const track = normalizeTrack(response.data?.songs?.[0], trackId);
      if (track) return track;
    } catch {
      // Try the next metadata source.
    }
  }

  return null;
}

function normalizeTrack(track, trackId) {
  if (!track || typeof track !== 'object') return null;
  return {
    id: String(track.id || trackId),
    name: track.name,
    duration: track.dt || track.duration || track.interval,
    albumName: track.al?.name || track.album?.name || track.albumName,
    singer:
      track.ar?.map(artist => artist.name).join('、') ||
      track.artists?.map(artist => artist.name).join('、') ||
      track.singer,
  };
}

function toLxMusicInfo(track, source) {
  return {
    source,
    songmid: track.id,
    id: track.id,
    name: track.name,
    singer: track.singer || '',
    albumName: track.albumName || '',
    interval: track.duration ? Math.round(Number(track.duration) / 1000) : 0,
  };
}

function normalizeQuality(quality) {
  if (typeof quality === 'string' && LEVEL_MAP[quality])
    return LEVEL_MAP[quality];
  if (quality === 999000) return 'flac24bit';
  if (quality === 350000 || quality === 'flac') return 'flac';
  if (quality === 320000 || quality === 'higher') return '320k';
  return '128k';
}

function normalizeUrl(result) {
  if (typeof result === 'string') return result.replace(/^http:/, 'https:');
  const url = result?.url || result?.data?.url || result?.data;
  return url ? String(url).replace(/^http:/, 'https:') : '';
}

function getBitrate(quality) {
  if (quality === 'flac24bit') return 999000;
  if (quality === 'flac') return 350000;
  if (quality === '320k') return 320000;
  return 128000;
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

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

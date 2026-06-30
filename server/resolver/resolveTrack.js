import { getCached, setCache } from './cache.js';
import { createStreamToken } from './streamProxy.js';
import { getConfig } from '../config.js';
import { logEntry } from '../storage/logger.js';
import { providerManager } from './providerManager.js';

/**
 * Resolve a track to a playable source.
 * Orchestrates: cache check → provider chain → stream proxy wrapping → cache write
 *
 * @param {number} trackId
 * @param {{ quality?: string, useProxy?: boolean }} context
 * @returns {Promise<object>}
 */
export async function resolveTrack(trackId, context = {}) {
  const config = getConfig();
  const requestedQuality = normalizeLevel(
    context.quality || config.audio?.defaultQuality || 'standard'
  );
  const useProxy =
    context.useProxy !== false && config.audio?.proxyStream !== false;
  const providerOrder = Array.isArray(context.providerOrder)
    ? context.providerOrder
    : config.audio?.providerOrder || ['netease', 'unblock', 'fallback'];
  const qualityOrder = getQualityCandidates(requestedQuality);

  const startTime = Date.now();
  const tried = [];

  for (const currentQuality of qualityOrder) {
    // Check cache for each provider in order
    for (const providerName of providerOrder) {
      const cached = getCached(trackId, currentQuality, providerName);
      if (cached) {
        logEntry({
          trackId,
          requestedQuality,
          resolvedQuality: currentQuality,
          source: providerName,
          result: 'cache_hit',
          durationMs: Date.now() - startTime,
        });
        return {
          ...buildResponse(cached, useProxy),
          tried: [
            {
              provider: providerName,
              errorCode: 'CACHE_HIT',
              quality: currentQuality,
            },
          ],
        };
      }
    }

    // Try each provider in order
    for (const providerName of providerOrder) {
      const provider = providerManager.get(providerName);
      if (!provider) {
        tried.push({
          provider: providerName,
          errorCode: 'PROVIDER_NOT_FOUND',
          quality: currentQuality,
        });
        continue;
      }

      const providerStart = Date.now();
      try {
        const result = await provider.resolve(trackId, {
          ...context,
          quality: currentQuality,
          lx: config.audio?.lx || {},
          unblock: config.audio?.unblock || {},
        });

        if (result?.ok && result.url) {
          const durationMs = Date.now() - startTime;

          const cacheEntry = {
            trackId,
            quality: currentQuality,
            source: result.source || providerName,
            url: result.url,
            mime: result.mime || 'audio/mpeg',
            br: result.br,
            size: result.size,
            md5: result.md5,
            urlExt: result.urlExt || getUrlExt(result.url),
            expiresAt: result.expiresAt || Date.now() + 30 * 60 * 1000,
          };
          setCache(trackId, currentQuality, providerName, cacheEntry);

          logEntry({
            trackId,
            requestedQuality,
            resolvedQuality: currentQuality,
            source: providerName,
            br: result.br,
            size: result.size,
            md5: result.md5,
            urlExt: result.urlExt || getUrlExt(result.url),
            result: 'ok',
            durationMs,
          });

          return {
            ...buildResponse(cacheEntry, useProxy),
            tried: tried.concat({
              provider: providerName,
              errorCode: 'OK',
              errorMessage: result.errorMessage,
              quality: currentQuality,
            }),
          };
        }

        const providerMs = Date.now() - providerStart;
        tried.push({
          provider: providerName,
          errorCode: result.errorCode || 'NO_SOURCE',
          errorMessage: result.errorMessage,
          durationMs: providerMs,
          quality: currentQuality,
        });
      } catch (error) {
        const providerMs = Date.now() - providerStart;
        tried.push({
          provider: providerName,
          errorCode: 'PROVIDER_FAILED',
          errorMessage: error.message,
          durationMs: providerMs,
          quality: currentQuality,
        });
      }
    }
  }

  // All providers failed
  const durationMs = Date.now() - startTime;
  const lastTried = tried[tried.length - 1];
  const errorCode = lastTried?.errorCode || 'NO_SOURCE';
  const errorMessage = lastTried?.errorMessage || '没有可用播放源';

  logEntry({
    trackId,
    requestedQuality,
    resolvedQuality: lastTried?.quality,
    result: 'fail',
    errorCode,
    durationMs,
    tried: tried.map(t => t.provider),
  });

  return {
    ok: false,
    code: errorCode,
    message: errorMessage,
    trackId,
    tried: tried.map(t => ({
      provider: t.provider,
      errorCode: t.errorCode,
      quality: t.quality,
    })),
    durationMs,
  };
}

function getUrlExt(url) {
  try {
    const clean = String(url).split('?')[0];
    const index = clean.lastIndexOf('.');
    return index >= 0 ? clean.slice(index + 1) : '';
  } catch {
    return '';
  }
}

function getQualityCandidates(quality) {
  const order = [
    'standard',
    'exhigh',
    'lossless',
    'hires',
    'jyeffect',
    'sky',
    'jymaster',
  ];
  const normalized = normalizeLevel(quality);
  const index = order.indexOf(normalized);
  return index === -1 ? ['standard'] : order.slice(0, index + 1).reverse();
}

function normalizeLevel(quality) {
  if (typeof quality === 'string') {
    if (
      [
        'standard',
        'exhigh',
        'lossless',
        'hires',
        'jyeffect',
        'sky',
        'jymaster',
      ].includes(quality)
    ) {
      return quality;
    }
    if (quality === 'flac') return 'lossless';
    if (quality === 'higher') return 'exhigh';
  }
  if (quality === 999000) return 'jymaster';
  if (quality === 350000) return 'lossless';
  if (quality === 320000) return 'exhigh';
  if (quality === 192000) return 'standard';
  return 'standard';
}

function buildResponse(cacheEntry, useProxy) {
  const canProxy = useProxy && !String(cacheEntry.url).startsWith('data:');
  const base = {
    ok: true,
    trackId: cacheEntry.trackId,
    mode: canProxy ? 'proxy' : 'direct',
    source: cacheEntry.source,
    quality: cacheEntry.quality,
    expiresAt: cacheEntry.expiresAt,
  };

  if (canProxy) {
    const token = createStreamToken(cacheEntry.url, {
      mime: cacheEntry.mime,
      trackId: cacheEntry.trackId,
      quality: cacheEntry.quality,
      source: cacheEntry.source,
    });
    base.playUrl = `/api/audio/stream/${token}`;
  } else {
    base.playUrl = cacheEntry.url;
  }

  return base;
}

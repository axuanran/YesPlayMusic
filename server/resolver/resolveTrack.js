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
  const quality = context.quality || config.audio?.defaultQuality || 'standard';
  const useProxy = context.useProxy !== false && config.audio?.proxyStream !== false;
  const providerOrder = config.audio?.providerOrder || ['netease', 'fallback'];

  const startTime = Date.now();
  const tried = [];

  // Check cache for each provider in order
  for (const providerName of providerOrder) {
    const cached = getCached(trackId, quality, providerName);
    if (cached) {
      logEntry({
        trackId,
        quality,
        source: providerName,
        result: 'cache_hit',
        durationMs: Date.now() - startTime,
      });
      return buildResponse(cached, useProxy);
    }
  }

  // Try each provider in order
  for (const providerName of providerOrder) {
    const provider = providerManager.get(providerName);
    if (!provider) {
      tried.push({ provider: providerName, errorCode: 'PROVIDER_NOT_FOUND' });
      continue;
    }

    const providerStart = Date.now();
    try {
      const result = await provider.resolve(trackId, { quality });

      if (result?.ok && result.url) {
        const durationMs = Date.now() - startTime;

        const cacheEntry = {
          trackId,
          quality,
          source: result.source || providerName,
          url: result.url,
          mime: result.mime || 'audio/mpeg',
          expiresAt: result.expiresAt || Date.now() + 30 * 60 * 1000,
        };
        setCache(trackId, quality, providerName, cacheEntry);

        logEntry({
          trackId,
          quality,
          source: providerName,
          result: 'ok',
          durationMs,
        });

        return buildResponse(cacheEntry, useProxy);
      }

      const providerMs = Date.now() - providerStart;
      tried.push({
        provider: providerName,
        errorCode: result.errorCode || 'NO_SOURCE',
        errorMessage: result.errorMessage,
        durationMs: providerMs,
      });
    } catch (error) {
      const providerMs = Date.now() - providerStart;
      tried.push({
        provider: providerName,
        errorCode: 'PROVIDER_FAILED',
        errorMessage: error.message,
        durationMs: providerMs,
      });
    }
  }

  // All providers failed
  const durationMs = Date.now() - startTime;
  const lastTried = tried[tried.length - 1];
  const errorCode = lastTried?.errorCode || 'NO_SOURCE';
  const errorMessage = lastTried?.errorMessage || '没有可用播放源';

  logEntry({
    trackId,
    quality,
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
    tried: tried.map(t => ({ provider: t.provider, errorCode: t.errorCode })),
    durationMs,
  };
}

function buildResponse(cacheEntry, useProxy) {
  const base = {
    ok: true,
    trackId: cacheEntry.trackId,
    mode: useProxy ? 'proxy' : 'direct',
    source: cacheEntry.source,
    quality: cacheEntry.quality,
    expiresAt: cacheEntry.expiresAt,
  };

  if (useProxy) {
    const token = createStreamToken(cacheEntry.url, { mime: cacheEntry.mime });
    base.playUrl = `/api/audio/stream/${token}`;
  } else {
    base.playUrl = cacheEntry.url;
  }

  return base;
}

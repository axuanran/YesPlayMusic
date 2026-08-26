import axios from 'axios';
import { clearAudioProviderCache } from '@/plugins/providers/audio/registry';
import { isCapacitor, isElectron } from '@/utils/env';

const RESOLVER_BASE_URL = '/resolver-api';
const DEFAULT_EMBEDDED_CACHE_TTL_SECONDS = 5 * 60;
let resolverAxios = null;

function getRuntimeSettings() {
  const runtimeSettings = globalThis?.yesplaymusicStore?.state?.settings;
  if (runtimeSettings) return runtimeSettings;
  try {
    return JSON.parse(localStorage.getItem('settings')) || {};
  } catch {
    return {};
  }
}

export function normalizeEmbeddedResolverConfig(value) {
  const config = value && typeof value === 'object' ? value : {};
  const audio =
    config.audio && typeof config.audio === 'object' ? config.audio : {};
  const mobile =
    audio.mobile && typeof audio.mobile === 'object' ? audio.mobile : {};
  const cacheTtl = Number(audio.cacheTtl);

  return {
    ...config,
    audio: {
      ...audio,
      cacheTtl:
        Number.isFinite(cacheTtl) && cacheTtl >= 0
          ? cacheTtl
          : DEFAULT_EMBEDDED_CACHE_TTL_SECONDS,
      fallbackToLegacy: audio.fallbackToLegacy !== false,
      mobile: {
        ...mobile,
        neteaseEnabled: mobile.neteaseEnabled !== false,
        outerUrlFallback: mobile.outerUrlFallback !== false,
      },
    },
  };
}

export function getEmbeddedResolverConfig() {
  return normalizeEmbeddedResolverConfig(
    getRuntimeSettings().embeddedResolverConfig
  );
}

function saveEmbeddedResolverConfig(config) {
  const normalized = normalizeEmbeddedResolverConfig(config);
  const store = globalThis?.yesplaymusicStore;
  if (store?.commit && store?.state?.settings) {
    store.commit('updateSettings', {
      key: 'embeddedResolverConfig',
      value: normalized,
    });
    return normalized;
  }

  try {
    const settings = JSON.parse(localStorage.getItem('settings')) || {};
    settings.embeddedResolverConfig = normalized;
    localStorage.setItem('settings', JSON.stringify(settings));
  } catch {
    // Runtime settings are expected to be available in the app. Keeping this
    // fallback silent lets isolated tests/bootstrap code still normalize data.
  }
  return normalized;
}

export function getCurrentPageResolverURL() {
  return isCapacitor ? 'embedded://audio-resolver' : RESOLVER_BASE_URL;
}

function getResolverClient() {
  if (isCapacitor) {
    throw new Error(
      'Android 使用 UI 内置音频 Provider，不提供 Resolver HTTP 接口'
    );
  }
  if (!resolverAxios) {
    resolverAxios = axios.create({
      baseURL: RESOLVER_BASE_URL,
      timeout: 10000,
    });
  }
  return resolverAxios;
}

/**
 * Resolve audio source via the resolver bundled with YesPlayMusic.
 * Desktop and Docker expose it on the same-origin /resolver-api prefix.
 * Android uses the UI provider directly instead of this HTTP API.
 *
 * @param {number} trackId
 * @param {string} [quality='standard']
 * @param {object} [options]
 * @returns {Promise<{ok: boolean, trackId: number, playUrl: string, mode: string, source: string, quality: string, expiresAt: number}>}
 */
export async function resolveAudioByBackend(
  trackId,
  quality = 'standard',
  options = {}
) {
  const client = getResolverClient();
  const { data } = await client.post(
    '/api/audio/resolve',
    {
      trackId,
      quality,
      bypassCache: options.bypassCache === true,
      track: options.track,
    },
    {
      signal: options.signal,
    }
  );

  if (!data.ok) {
    const error = new Error(data.message || '音频解析失败');
    error.code = data.code;
    error.tried = data.tried;
    throw error;
  }

  if (data.playUrl && data.playUrl.startsWith('/')) {
    data.playUrl = `${RESOLVER_BASE_URL}${data.playUrl}`;
  }

  return data;
}

export function isResolverEnabled() {
  return getRuntimeSettings()?.useAudioResolver === true;
}

export async function getResolverConfig() {
  if (isCapacitor) {
    return { ok: true, config: getEmbeddedResolverConfig(), embedded: true };
  }
  const client = getResolverClient();
  const { data } = await client.get('/api/admin/config');
  return data;
}

export async function updateResolverConfig(config) {
  if (isCapacitor) {
    const normalized = saveEmbeddedResolverConfig(config);
    clearAudioProviderCache();
    return { ok: true, config: normalized, embedded: true };
  }
  const client = getResolverClient();
  const { data } = await client.post('/api/admin/config', config || {});
  return data;
}

/**
 * Sync cookie to the bundled resolver for persistence.
 * Android already shares the app login state with its native API layer, so no
 * separate resolver cookie store is required there.
 *
 * @param {string} cookie
 * @returns {Promise<boolean>} Whether the cookie was synced or already shared
 */
export async function syncCookieToResolver(cookie) {
  if (!cookie || !isResolverEnabled()) return false;
  if (isCapacitor) return true;

  const client = getResolverClient();
  await client.post('/api/admin/cookie', { cookie });
  console.log('[resolver] Cookie synced to bundled resolver');
  return true;
}

/**
 * Wait until the bundled resolver is reachable, then sync cookie once.
 *
 * @param {string} cookie
 * @param {{ timeoutMs?: number, intervalMs?: number, onAttempt?: (attempt:number, error?:Error) => void }} [options]
 * @returns {Promise<boolean>}
 */
export async function syncCookieToResolverWithRetry(cookie, options = {}) {
  if (!cookie || !isResolverEnabled()) return false;
  if (isCapacitor) {
    options.onAttempt?.(1);
    return true;
  }

  const timeoutMs = options.timeoutMs ?? 30000;
  const intervalMs = options.intervalMs ?? 1000;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastError;

  while (Date.now() <= deadline) {
    attempt += 1;
    try {
      const client = getResolverClient();
      await client.get('/api/admin/cookie');
      return await syncCookieToResolver(cookie);
    } catch (error) {
      lastError = error;
      options.onAttempt?.(attempt, error);
      if (Date.now() > deadline) break;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  throw lastError || new Error('内置音频解析服务未就绪');
}

/**
 * Clear cookie from the bundled resolver.
 * @returns {Promise<void>}
 */
export async function clearCookieFromResolver() {
  if (isCapacitor) return;
  try {
    const client = getResolverClient();
    await client.delete('/api/admin/cookie');
    console.log('[resolver] Cookie cleared from bundled resolver');
  } catch (error) {
    console.warn(
      '[resolver] Failed to clear bundled resolver cookie:',
      error.message
    );
  }
}

/**
 * Clear both UI-provider cache and bundled resolver cache.
 * @returns {Promise<void>}
 */
export async function clearResolverCache() {
  clearAudioProviderCache();
  if (isCapacitor) return;

  try {
    const client = getResolverClient();
    await client.post('/api/admin/cache/clear');
    console.log('[resolver] Bundled resolver cache cleared');
  } catch (error) {
    // Static web builds can run without the Node resolver. Keep their UI cache
    // clear operation usable while still surfacing a real desktop regression.
    if (isElectron) throw error;
    console.warn(
      '[resolver] Bundled resolver cache unavailable:',
      error.message
    );
  }
}

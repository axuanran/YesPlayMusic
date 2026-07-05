import axios from 'axios';

let resolverAxios = null;

function getResolverBaseURL() {
  // In dev mode, use Vite proxy to avoid CORS issues
  // In production, use the configured URL or relative path
  if (import.meta.env.DEV) {
    return '/resolver-api';
  }
  try {
    const settings = JSON.parse(localStorage.getItem('settings'));
    return settings?.audioResolverUrl || '/resolver-api';
  } catch {
    return '/resolver-api';
  }
}

function getResolverClient() {
  const baseURL = getResolverBaseURL();
  if (!resolverAxios || resolverAxios.defaults.baseURL !== baseURL) {
    resolverAxios = axios.create({
      baseURL,
      timeout: 15000,
    });
  }
  return resolverAxios;
}

/**
 * Resolve audio source via backend resolver service.
 * POST {baseURL}/api/audio/resolve
 *
 * @param {number} trackId
 * @param {string} [quality='standard']
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

  // If playUrl is relative (starts with /), prepend the resolver base URL
  // so the Audio element loads from the correct origin even in web dev mode
  // where the app origin differs from the resolver server port.
  if (data.playUrl && data.playUrl.startsWith('/')) {
    data.playUrl = getResolverBaseURL() + data.playUrl;
  }

  return data;
}

export function isResolverEnabled() {
  try {
    const settings = JSON.parse(localStorage.getItem('settings'));
    return settings?.useAudioResolver === true;
  } catch {
    return false;
  }
}

export async function getResolverConfig() {
  const client = getResolverClient();
  const { data } = await client.get('/api/admin/config');
  return data;
}

export async function updateResolverConfig(config) {
  const client = getResolverClient();
  const { data } = await client.post('/api/admin/config', config);
  return data;
}

/**
 * Sync cookie to resolver backend for persistence.
 * Called after successful login so resolver can use the cookie for API requests.
 * @param {string} cookie - The cookie string to sync
 * @returns {Promise<void>}
 */
export async function syncCookieToResolver(cookie) {
  if (!cookie) return;
  const client = getResolverClient();
  await client.post('/api/admin/cookie', { cookie });
  console.log('[resolver] Cookie synced to backend');
}

/**
 * Wait until resolver backend is reachable, then sync cookie once.
 * Useful when the backend starts slower than the renderer.
 * @param {string} cookie
 * @param {{ timeoutMs?: number, intervalMs?: number, onAttempt?: (attempt:number, error?:Error) => void }} [options]
 * @returns {Promise<void>}
 */
export async function syncCookieToResolverWithRetry(cookie, options = {}) {
  if (!cookie) return;
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
      await syncCookieToResolver(cookie);
      return;
    } catch (error) {
      lastError = error;
      options.onAttempt?.(attempt, error);
      if (Date.now() > deadline) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }

  throw lastError || new Error('resolver 后端未就绪');
}

/**
 * Clear cookie from resolver backend.
 * Called on logout.
 * @returns {Promise<void>}
 */
export async function clearCookieFromResolver() {
  try {
    const client = getResolverClient();
    await client.delete('/api/admin/cookie');
    console.log('[resolver] Cookie cleared from backend');
  } catch (error) {
    console.warn(
      '[resolver] Failed to clear cookie from backend:',
      error.message
    );
  }
}

/**
 * Clear resolver backend cache.
 * Called from the front-end settings page when you want to invalidate stale audio sources.
 * @returns {Promise<void>}
 */
export async function clearResolverCache() {
  try {
    const client = getResolverClient();
    await client.post('/api/admin/cache/clear');
    console.log('[resolver] Cache cleared on backend');
  } catch (error) {
    console.warn('[resolver] Failed to clear backend cache:', error.message);
    throw error;
  }
}

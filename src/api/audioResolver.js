import { clearAudioProviderCache } from '@/plugins/providers/audio/registry';

export function getCurrentPageResolverURL() {
  return 'embedded://audio-resolver';
}

/**
 * Resolve audio source via backend resolver service.
 * POST {baseURL}/api/audio/resolve
 *
 * @param {number} trackId
 * @param {string} [quality='standard']
 * @returns {Promise<{ok: boolean, trackId: number, playUrl: string, mode: string, source: string, quality: string, expiresAt: number}>}
 */
export async function resolveAudioByBackend() {
  throw new Error('独立音频解析后端已停用，请使用内置音频 Provider');
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
  try {
    const settings = JSON.parse(localStorage.getItem('settings')) || {};
    return { config: settings.embeddedResolverConfig || {} };
  } catch {
    return { config: {} };
  }
}

export async function updateResolverConfig(config) {
  const settings = JSON.parse(localStorage.getItem('settings')) || {};
  settings.embeddedResolverConfig = config || {};
  localStorage.setItem('settings', JSON.stringify(settings));
  return { ok: true, config };
}

/**
 * Sync cookie to resolver backend for persistence.
 * Called after successful login so resolver can use the cookie for API requests.
 * @param {string} cookie - The cookie string to sync
 * @returns {Promise<boolean>} Whether the cookie was synced
 */
export async function syncCookieToResolver(cookie) {
  return Boolean(cookie && isResolverEnabled());
}

/**
 * Wait until resolver backend is reachable, then sync cookie once.
 * Useful when the backend starts slower than the renderer.
 * @param {string} cookie
 * @param {{ timeoutMs?: number, intervalMs?: number, onAttempt?: (attempt:number, error?:Error) => void }} [options]
 * @returns {Promise<boolean>} Whether the cookie was synced
 */
export async function syncCookieToResolverWithRetry(cookie, options = {}) {
  options.onAttempt?.(1);
  return syncCookieToResolver(cookie);
}

/**
 * Clear cookie from resolver backend.
 * Called on logout.
 * @returns {Promise<void>}
 */
export async function clearCookieFromResolver() {
  return undefined;
}

/**
 * Clear resolver backend cache.
 * Called from the front-end settings page when you want to invalidate stale audio sources.
 * @returns {Promise<void>}
 */
export async function clearResolverCache() {
  clearAudioProviderCache();
}

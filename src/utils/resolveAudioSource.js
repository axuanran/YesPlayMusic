import { resolveAudioByBackend, isResolverEnabled } from '@/api/audioResolver';
import { getMP3 } from '@/api/track';
import { isAccountLoggedIn } from '@/utils/auth';

/**
 * Resolve audio source for a track.
 * If resolver is enabled in settings, try backend first, then fall back to legacy.
 *
 * @param {number} trackId
 * @returns {Promise<string>} playUrl
 */
export async function resolveTrackSource(trackId) {
  if (isResolverEnabled()) {
    try {
      const result = await resolveAudioByBackend(trackId);
      return result.playUrl;
    } catch (error) {
      console.warn('[resolver] backend failed, fallback to legacy:', error.message);
    }
  }

    return resolveFromLegacy(trackId);
}

/**
 * Detect web dev mode: browser env with Vite dev server (not Electron, not production).
 * Uses only runtime checks, no compile-time defines.
 */
export function isWebDevMode() {
  try {
    // Electron injects __APP_ENV__ at build time. If absent, we're in a browser.
    // import.meta.env.DEV is injected by Vite: true in dev, false in prod.
    // Fallback: check hostname for local dev patterns.
    if (typeof __APP_ENV__ !== 'undefined') return false; // Electron
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV === true) return true;
    // Last resort: localhost dev server
    const host = window?.location?.hostname || '';
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

/**
 * Get the outer URL for a track, proxied through Vite in web dev mode
 * to avoid CORS issues.
 * @param {number} trackId
 * @returns {string}
 */
export function getOuterAudioUrl(trackId) {
  if (isWebDevMode()) {
    console.log("[resolver] web dev mode: proxying outer URL for track ".concat(trackId));
    return '/__audio_proxy/'.concat(trackId);
  }
  return 'https://music.163.com/song/media/outer/url?id='.concat(trackId);
}

/**
 * Legacy audio source resolution (existing getMP3 + outer URL logic).
 */
async function resolveFromLegacy(trackId) {
  if (isAccountLoggedIn()) {
    const result = await getMP3(trackId);
    if (result.data?.[0]?.url && result.data[0].freeTrialInfo === null) {
      return result.data[0].url.replace(/^http:/, 'https:');
    }
  }

  return getOuterAudioUrl(trackId);
}

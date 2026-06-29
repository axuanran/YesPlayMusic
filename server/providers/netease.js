import axios from 'axios';
import { loadCookie } from '../storage/cookieStore.js';

const NETEASE_API_BASE = 'http://127.0.0.1:10754';
const QUALITY_LEVELS = new Set([
  'standard',
  'exhigh',
  'lossless',
  'hires',
  'jyeffect',
  'sky',
  'jymaster',
]);

export const providerName = 'netease';

/**
 * @param {number} trackId
 * @param {{ quality?: string }} context
 * @returns {Promise<{ok: boolean, url?: string, mime?: string, quality?: string, source?: string, expiresAt?: number, errorCode?: string, errorMessage?: string}>}
 */
export async function resolve(trackId, context = {}) {
  const level = normalizeLevel(context.quality);
  const cookie = loadCookie();

  try {
    const response = await axios.get(`${NETEASE_API_BASE}/song/url/v1`, {
      params: { id: trackId, level },
      timeout: 10000,
      headers: cookie ? { Cookie: cookie } : {},
    });

    const data = response.data;

    if (data.code === 301) {
      return { ok: false, errorCode: 'NEED_LOGIN', errorMessage: '需要登录' };
    }

    if (!data.data || !data.data[0] || !data.data[0].url) {
      if (data.data?.[0]?.freeTrialInfo !== null && data.data?.[0]?.freeTrialInfo !== undefined) {
        return { ok: false, errorCode: 'VIP_REQUIRED', errorMessage: '需要有效权益' };
      }
      return { ok: false, errorCode: 'NO_SOURCE', errorMessage: '没有可用音源' };
    }

    const song = data.data[0];
    const url = song.url.replace(/^http:/, 'https:');

    return {
      ok: true,
      url,
      mime: song.type || 'audio/mpeg',
      quality: song.level || level,
      br: song.br,
      size: song.size,
      md5: song.md5,
      urlExt: getUrlExt(url),
      source: 'netease',
      expiresAt: Date.now() + 30 * 60 * 1000,
    };
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return { ok: false, errorCode: 'PROVIDER_TIMEOUT', errorMessage: '音源超时' };
    }
    return { ok: false, errorCode: 'PROVIDER_FAILED', errorMessage: error.message };
  }
}

function normalizeLevel(level) {
  if (typeof level === 'string' && QUALITY_LEVELS.has(level)) {
    return level;
  }
  if (level === 999000) return 'jymaster';
  if (level === 350000 || level === 'flac') return 'lossless';
  if (level === 320000) return 'exhigh';
  return 'standard';
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

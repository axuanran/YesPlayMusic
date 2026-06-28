import axios from 'axios';
import { loadCookie } from '../storage/cookieStore.js';

const NETEASE_API_BASE = 'http://127.0.0.1:10754';

const QUALITY_BR = {
  standard: '320000',
  higher: '320000',
  exhigh: '320000',
  lossless: '350000',
  hires: '350000',
  flac: '350000',
};

export const providerName = 'netease';

/**
 * @param {number} trackId
 * @param {{ quality?: string }} context
 * @returns {Promise<{ok: boolean, url?: string, mime?: string, quality?: string, source?: string, expiresAt?: number, errorCode?: string, errorMessage?: string}>}
 */
export async function resolve(trackId, context = {}) {
  const quality = context.quality || 'standard';
  const br = QUALITY_BR[quality] || '320000';
  const cookie = loadCookie();

  try {
    const response = await axios.get(`${NETEASE_API_BASE}/song/url`, {
      params: { id: trackId, br },
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
      quality: song.br >= 350000 ? 'lossless' : 'standard',
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

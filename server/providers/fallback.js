// Fallback provider: uses Netease outer URL (no login required)
// This is the last-resort provider when all others fail

export const providerName = 'fallback';

/**
 * @param {number} trackId
 * @param {{ quality?: string }} context
 * @returns {Promise<{ok: boolean, url?: string, mime?: string, quality?: string, source?: string, expiresAt?: number}>}
 */
export async function resolve(trackId, context = {}) {
  const url = `https://music.163.com/song/media/outer/url?id=${trackId}`;
  return {
    ok: true,
    url,
    mime: 'audio/mpeg',
    quality: context.quality || 'standard',
    source: 'fallback',
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
}

// Fallback provider: uses Netease outer URL (no login required)
// This is the last-resort provider when all others fail

import axios from 'axios';

export const providerName = 'fallback';

function isPlayableContentType(contentType = '') {
  const normalized = contentType.toLowerCase();
  return (
    !normalized ||
    normalized.includes('audio/') ||
    normalized.includes('application/octet-stream')
  );
}

/**
 * @param {number} trackId
 * @param {{ quality?: string }} context
 * @returns {Promise<{ok: boolean, url?: string, mime?: string, quality?: string, source?: string, expiresAt?: number}>}
 */
export async function resolve(trackId, context = {}) {
  const url = `https://music.163.com/song/media/outer/url?id=${trackId}`;
  const response = await axios.get(url, {
    headers: {
      Range: 'bytes=0-0',
      Referer: 'https://music.163.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    maxRedirects: 5,
    responseType: 'stream',
    timeout: 5000,
    validateStatus: status => status === 200 || status === 206,
  });
  const contentType = response.headers['content-type'] || '';
  response.data.destroy();
  if (!isPlayableContentType(contentType)) {
    return {
      ok: false,
      errorCode: 'INVALID_STREAM_CONTENT_TYPE',
      errorMessage: `Fallback returned non-audio content-type: ${contentType}`,
    };
  }
  return {
    ok: true,
    url,
    mime: 'audio/mpeg',
    quality: context.quality || 'standard',
    source: 'fallback',
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
}

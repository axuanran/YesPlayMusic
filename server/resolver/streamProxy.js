import crypto from 'node:crypto';
import axios from 'axios';
import { logEntry } from '../storage/logger.js';
import { loadCookie } from '../storage/cookieStore.js';

// Token store: short-lived tokens mapping to real URLs
const tokenStore = new Map();
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function buildUpstreamHeaders(rangeHeader) {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Referer: 'https://music.163.com/',
    Origin: 'https://music.163.com',
  };
  const cookie = loadCookie();
  if (cookie) {
    headers.Cookie = cookie;
  }
  if (rangeHeader) {
    headers.Range = rangeHeader;
  }
  return headers;
}

/**
 * Store a real URL and return a short-lived proxy token.
 */
export function createStreamToken(realUrl, metadata = {}) {
  const token = generateToken();
  tokenStore.set(token, {
    url: realUrl,
    mime: metadata.mime || 'audio/mpeg',
    trackId: metadata.trackId,
    quality: metadata.quality,
    source: metadata.source,
    provider: metadata.provider,
    br: metadata.br,
    size: metadata.size,
    md5: metadata.md5,
    urlExt: metadata.urlExt,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });

  // Clean expired tokens periodically
  if (tokenStore.size > 1000) {
    const now = Date.now();
    for (const [key, entry] of tokenStore) {
      if (now > entry.expiresAt) tokenStore.delete(key);
    }
  }

  return token;
}

/**
 * Look up a token and return the real URL + metadata.
 * Returns null if token is invalid or expired.
 */
export function resolveStreamToken(token) {
  const entry = tokenStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenStore.delete(token);
    return null;
  }
  return entry;
}

export function deleteStreamToken(token) {
  return tokenStore.delete(token);
}

function getProxyErrorCode(error) {
  return error?.response?.status || error?.code || 'PROXY_FAILED';
}

function isRetryableProxyError(error) {
  return [403, 404, 410].includes(Number(error?.response?.status));
}

/**
 * Proxy an audio stream from realUrl to the response.
 * Handles Range requests for seek support.
 */
export async function proxyStream(realUrl, req, res) {
  const rangeHeader = req.headers.range;
  const startTime = Date.now();
  const token = req.params?.token;
  const entry = token ? tokenStore.get(token) : null;

  try {
    if (rangeHeader) {
      // Forward Range request to the real source
      const headResponse = await axios.head(realUrl, {
        timeout: 5000,
        headers: buildUpstreamHeaders(rangeHeader),
        validateStatus: () => true,
      });

      const contentLength = parseInt(headResponse.headers['content-length'], 10) || 0;
      const acceptRanges = headResponse.headers['accept-ranges'];

      if (acceptRanges === 'bytes' && contentLength > 0) {
        const proxyResponse = await axios.get(realUrl, {
          headers: buildUpstreamHeaders(rangeHeader),
          responseType: 'stream',
          timeout: 30000,
          validateStatus: status => status === 200 || status === 206,
        });

        res.status(proxyResponse.status);
        res.set('Content-Type', proxyResponse.headers['content-type'] || 'audio/mpeg');
        res.set('Content-Length', proxyResponse.headers['content-length']);
        res.set('Content-Range', proxyResponse.headers['content-range']);
        res.set('Accept-Ranges', 'bytes');
        res.set('Cache-Control', 'public, max-age=3600');
res.set('Access-Control-Allow-Origin', '*');

    proxyResponse.data.pipe(res);
    logEntry({
      result: 'ok',
      source: 'streamProxy',
      trackId: entry?.trackId,
      quality: entry?.quality,
      provider: entry?.provider || entry?.source,
      br: entry?.br,
      size: entry?.size,
      md5: entry?.md5,
      urlExt: entry?.urlExt,
      durationMs: Date.now() - startTime,
      errorCode: undefined,
      note: `range ${proxyResponse.status} ${proxyResponse.headers['content-type'] || 'audio/mpeg'} ${realUrl}`,
    });
        return;
      }
    }

    // Full stream proxy (no Range)
    const proxyResponse = await axios.get(realUrl, {
      headers: buildUpstreamHeaders(),
      responseType: 'stream',
      timeout: 30000,
      validateStatus: status => status === 200,
    });

    res.status(200);
    res.set('Content-Type', proxyResponse.headers['content-type'] || 'audio/mpeg');
    if (proxyResponse.headers['content-length']) {
      res.set('Content-Length', proxyResponse.headers['content-length']);
    }
    res.set('Accept-Ranges', 'bytes');
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Access-Control-Allow-Origin', '*');

    proxyResponse.data.pipe(res);
    logEntry({
      result: 'ok',
      source: 'streamProxy',
      trackId: entry?.trackId,
      quality: entry?.quality,
      provider: entry?.provider || entry?.source,
      br: entry?.br,
      size: entry?.size,
      md5: entry?.md5,
      urlExt: entry?.urlExt,
      durationMs: Date.now() - startTime,
      errorCode: undefined,
      note: `full ${proxyResponse.status} ${proxyResponse.headers['content-type'] || 'audio/mpeg'} ${realUrl}`,
    });
  } catch (error) {
    if (!res.headersSent) {
      const errorCode = getProxyErrorCode(error);
        logEntry({
          result: 'fail',
          source: 'streamProxy',
          trackId: entry?.trackId,
          quality: entry?.quality,
          provider: entry?.provider || entry?.source,
          br: entry?.br,
          size: entry?.size,
          md5: entry?.md5,
          urlExt: entry?.urlExt,
          errorCode,
          durationMs: Date.now() - startTime,
          note: `${realUrl} ${error?.message || ''}`.trim(),
        });
      if (isRetryableProxyError(error)) {
        return { ok: false, retryable: true, code: errorCode };
      }
      res.status(502).json({ ok: false, code: 'PROXY_FAILED', reason: '代理流失败' });
    }
  }
  return { ok: true };
}

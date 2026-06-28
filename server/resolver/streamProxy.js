import crypto from 'node:crypto';
import axios from 'axios';

// Token store: short-lived tokens mapping to real URLs
const tokenStore = new Map();
const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Store a real URL and return a short-lived proxy token.
 */
export function createStreamToken(realUrl, metadata = {}) {
  const token = generateToken();
  tokenStore.set(token, {
    url: realUrl,
    mime: metadata.mime || 'audio/mpeg',
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

/**
 * Proxy an audio stream from realUrl to the response.
 * Handles Range requests for seek support.
 */
export async function proxyStream(realUrl, req, res) {
  const rangeHeader = req.headers.range;

  try {
    if (rangeHeader) {
      // Forward Range request to the real source
      const headResponse = await axios.head(realUrl, {
        timeout: 5000,
        validateStatus: () => true,
      });

      const contentLength = parseInt(headResponse.headers['content-length'], 10) || 0;
      const acceptRanges = headResponse.headers['accept-ranges'];

      if (acceptRanges === 'bytes' && contentLength > 0) {
        const proxyResponse = await axios.get(realUrl, {
          headers: { Range: rangeHeader },
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
        return;
      }
    }

    // Full stream proxy (no Range)
    const proxyResponse = await axios.get(realUrl, {
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
  } catch (error) {
    if (!res.headersSent) {
      res.status(502).json({ ok: false, code: 'PROXY_FAILED', reason: '代理流失败' });
    }
  }
}

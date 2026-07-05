import { Router } from 'express';
import { resolveTrack } from '../resolver/resolveTrack.js';
import { deleteCache } from '../resolver/cache.js';
import {
  deleteStreamToken,
  resolveStreamToken,
  proxyStream,
} from '../resolver/streamProxy.js';

const router = Router();

// GET /api/health
router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'yesplaymusic-audio-resolver',
    version: '0.1.0',
  });
});

// POST /api/audio/resolve
router.post('/audio/resolve', async (req, res) => {
  try {
    const { trackId, quality, track, bypassCache } = req.body;

    if (!trackId) {
      return res.status(400).json({
        ok: false,
        code: 'INVALID_TRACK_ID',
        message: '缺少 trackId',
      });
    }

    const result = await resolveTrack(Number(trackId), {
      quality: quality || 'standard',
      track,
      bypassCache: bypassCache === true,
    });

    if (!result.ok) {
      return res.status(502).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      code: 'INTERNAL_ERROR',
      message: error.message || '解析失败',
    });
  }
});

// GET /api/audio/stream/:token
router.get('/audio/stream/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const entry = resolveStreamToken(token);

    if (!entry) {
      return res.status(404).json({
        ok: false,
        code: 'TOKEN_EXPIRED',
        message: '播放令牌已过期或无效',
      });
    }

    const proxyResult = await proxyStream(entry.url, req, res);
    if (!proxyResult?.retryable || res.headersSent || !entry.trackId) return;

    const provider = entry.provider || entry.source;
    deleteStreamToken(token);
    if (provider) {
      deleteCache(entry.trackId, entry.quality, provider);
    }

    const fallback = await resolveTrack(Number(entry.trackId), {
      quality: entry.quality || 'standard',
      bypassCache: true,
      skipProviders: provider ? [provider] : [],
      useProxy: true,
    });

    if (fallback.ok && fallback.playUrl) {
      return res.redirect(307, fallback.playUrl);
    }

    res.status(502).json({
      ok: false,
      code: proxyResult.code || fallback.code || 'STREAM_SOURCE_EXPIRED',
      message: fallback.message || '播放源已失效，且没有可用替代源',
      tried: fallback.tried,
    });
  } catch {
    if (!res.headersSent) {
      res.status(502).json({
        ok: false,
        code: 'STREAM_PROXY_FAILED',
        message: '代理流失败',
      });
    }
  }
});

export default router;

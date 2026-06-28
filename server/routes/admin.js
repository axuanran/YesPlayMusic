import { Router } from 'express';
import { getConfig, saveConfig } from '../config.js';
import { resolveTrack } from '../resolver/resolveTrack.js';
import { clearCache, cacheSize } from '../resolver/cache.js';
import { getLogs, clearLogs } from '../storage/logger.js';
import { providerManager } from '../resolver/providerManager.js';
import { loadCookie, saveCookie, clearCookie, hasCookie } from '../storage/cookieStore.js';

const router = Router();

// Simple admin token check middleware
function adminAuth(req, res, next) {
  const config = getConfig();
  const token = config.security?.adminToken;
  if (!token) return next(); // No token configured = open access
  const auth = req.headers['x-admin-token'] || req.query.token;
  if (auth === token) return next();
  res.status(403).json({ ok: false, message: 'Forbidden' });
}

// All admin routes require auth
router.use(adminAuth);

// GET /api/admin/config
router.get('/config', (_req, res) => {
  res.json({ ok: true, config: getConfig() });
});

// POST /api/admin/config
router.post('/config', (req, res) => {
  try {
    const newConfig = req.body;
    if (!newConfig || typeof newConfig !== 'object') {
      return res.status(400).json({ ok: false, message: 'Invalid config' });
    }
    saveConfig(newConfig);
    res.json({ ok: true, config: getConfig() });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

// GET /api/admin/cookie - Check if cookie is stored
router.get('/cookie', (_req, res) => {
  res.json({ ok: true, hasCookie: hasCookie() });
});

// POST /api/admin/cookie - Store cookie from frontend
router.post('/cookie', (req, res) => {
  try {
    const { cookie } = req.body;
    if (!cookie || typeof cookie !== 'string') {
      return res.status(400).json({ ok: false, message: 'Invalid cookie' });
    }
    saveCookie(cookie);
    res.json({ ok: true, message: 'Cookie saved' });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

// DELETE /api/admin/cookie - Clear stored cookie
router.delete('/cookie', (_req, res) => {
  clearCookie();
  res.json({ ok: true, message: 'Cookie cleared' });
});

// POST /api/admin/test-resolve
router.post('/test-resolve', async (req, res) => {
  try {
    const { trackId, quality } = req.body;
    if (!trackId) {
      return res.status(400).json({ ok: false, message: '缺少 trackId' });
    }
    const result = await resolveTrack(Number(trackId), {
      quality: quality || 'standard',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

// GET /api/admin/logs
router.get('/logs', (req, res) => {
  const count = parseInt(req.query.count) || 200;
  res.json({ ok: true, logs: getLogs(count) });
});

// DELETE /api/admin/logs
router.delete('/logs', (_req, res) => {
  clearLogs();
  res.json({ ok: true });
});

// POST /api/admin/cache/clear
router.post('/cache/clear', (_req, res) => {
  clearCache();
  res.json({ ok: true, message: '缓存已清理' });
});

// GET /api/admin/stats
router.get('/stats', (_req, res) => {
  const logs = getLogs(1000);
  const successCount = logs.filter(l => l.result === 'ok' || l.result === 'cache_hit').length;
  const failCount = logs.filter(l => l.result === 'fail').length;
  const recentErrors = logs.filter(l => l.result === 'fail').slice(0, 5);
  res.json({
    ok: true,
    cacheSize: cacheSize(),
    successCount,
    failCount,
    recentErrors,
    providers: providerManager.list(),
  });
});

export default router;

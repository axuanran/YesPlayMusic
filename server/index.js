import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { registerProvider } from './resolver/providerManager.js';
import * as neteaseProvider from './providers/netease.js';
import * as lxProvider from './providers/lx.js';
import * as unblockProvider from './providers/unblock.js';
import * as fallbackProvider from './providers/fallback.js';
import audioRoutes from './routes/audio.js';
import adminRoutes, { setRestartHandler } from './routes/admin.js';

function currentModulePath(moduleUrl) {
  if (moduleUrl) {
    try {
      return fileURLToPath(moduleUrl);
    } catch {
      // SEA bundles do not expose a normal file URL for import.meta.url.
    }
  }
  return process.execPath;
}

const __dirname = path.dirname(currentModulePath(import.meta.url));

// Register providers
registerProvider(neteaseProvider);
registerProvider(lxProvider);
registerProvider(unblockProvider);
registerProvider(fallbackProvider);
setRestartHandler(() => {
  setTimeout(() => process.exit(0), 100);
});

const config = loadConfig();

const app = express();

// JSON body parser
app.use(express.json());

// CORS for admin panel (served from same origin in Electron, separate for standalone)
app.use((_req, res, next) => {
  const origins = config.security?.allowOrigins || ['*'];
  const reqOrigin = _req.headers.origin || '*';
  if (origins.includes('*') || origins.includes(reqOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
  } else if (origins.length > 0) {
    res.setHeader('Access-Control-Allow-Origin', origins[0]);
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (_req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Serve admin panel
const adminDir = path.join(__dirname, '..', 'admin');
app.use('/admin', express.static(adminDir));

// API routes
app.use('/api', audioRoutes);
app.use('/api/admin', adminRoutes);

// Start server
const host = config.server?.host || '127.0.0.1';
const port = config.server?.port || 27232;

app.listen(port, host, () => {
  console.log(`[resolver] listening on http://${host}:${port}`);
  console.log(`[resolver] admin panel at http://${host}:${port}/admin`);
  console.log(
    `[resolver] providers: ${Array.from(
      new Set([
        neteaseProvider.providerName,
        lxProvider.providerName,
        unblockProvider?.providerName,
        fallbackProvider.providerName,
      ])
    ).join(', ')}`
  );
});

export default app;

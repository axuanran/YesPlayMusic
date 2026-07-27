import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function getAppDataDir() {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

export function resolveCacheDir({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
  customDir = '',
} = {}) {
  if (env.YPM_RESOLVER_CACHE_DIR) {
    return env.YPM_RESOLVER_CACHE_DIR;
  }
  if (customDir) {
    return customDir;
  }

  if (platform === 'win32') {
    const localAppData =
      env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
    return path.join(localAppData, 'YesPlayMusic', 'resolver');
  }
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Caches', 'YesPlayMusic', 'resolver');
  }

  const cacheHome = env.XDG_CACHE_HOME || path.join(homeDir, '.cache');
  return path.join(cacheHome, 'YesPlayMusic', 'resolver');
}

export function getStorageDir() {
  if (process.env.YPM_RESOLVER_STORAGE_DIR) {
    return process.env.YPM_RESOLVER_STORAGE_DIR;
  }

  return path.join(getAppDataDir(), 'YesPlayMusic', 'resolver-storage');
}

export function getCacheDir(customDir = '') {
  return resolveCacheDir({ customDir });
}

export function ensureStorageDir() {
  const storageDir = getStorageDir();
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  return storageDir;
}

export function ensureCacheDir(customDir = '') {
  const cacheDir = getCacheDir(customDir);
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

export function getStoragePath(filename) {
  return path.join(ensureStorageDir(), filename);
}

export function getCachePath(filename, customDir = '') {
  return path.join(ensureCacheDir(customDir), filename);
}

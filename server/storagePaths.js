import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getAppDataDir() {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
}

export function getStorageDir() {
  if (process.env.YPM_RESOLVER_STORAGE_DIR) {
    return process.env.YPM_RESOLVER_STORAGE_DIR;
  }

  if (__dirname.includes('.asar')) {
    return path.join(getAppDataDir(), 'YesPlayMusic', 'resolver-storage');
  }

  return path.join(__dirname, 'storage');
}

export function ensureStorageDir() {
  const storageDir = getStorageDir();
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
  return storageDir;
}

export function getStoragePath(filename) {
  return path.join(ensureStorageDir(), filename);
}

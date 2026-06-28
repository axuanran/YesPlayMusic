import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(__dirname, 'storage');
const CONFIG_PATH = path.join(STORAGE_DIR, 'config.json');

const DEFAULT_CONFIG = {
  server: {
    host: '127.0.0.1',
    port: 27232,
  },
  security: {
    adminToken: '',
    allowOrigins: [
      'http://localhost:27232',
      'http://127.0.0.1:27232',
    ],
  },
  audio: {
    proxyStream: true,
    defaultQuality: 'standard',
    cacheTtl: 1800,
    providerOrder: ['netease', 'fallback'],
    fallbackToLegacy: true,
  },
};

let _config = null;

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export function loadConfig() {
  if (_config) return _config;
  ensureStorageDir();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    _config = deepMerge(DEFAULT_CONFIG, JSON.parse(raw));
  } catch {
    _config = { ...DEFAULT_CONFIG };
    saveConfig(_config);
  }
  return _config;
}

export function saveConfig(config) {
  ensureStorageDir();
  _config = config;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfig() {
  return _config || loadConfig();
}

export function reloadConfig() {
  _config = null;
  return loadConfig();
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = deepMerge(base[key] || {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

import fs from 'node:fs';
import { ensureStorageDir, getStoragePath } from './storagePaths.js';

const CONFIG_PATH = getStoragePath('config.json');

const DEFAULT_CONFIG = {
  server: {
    host: '127.0.0.1',
    port: 27232,
  },
  security: {
    adminToken: '',
    allowOrigins: ['http://localhost:27232', 'http://127.0.0.1:27232'],
  },
  audio: {
    proxyStream: true,
    defaultQuality: 'standard',
    cacheTtl: 1800,
    providerOrder: ['netease', 'lx', 'unblock', 'fallback'],
    fallbackToLegacy: true,
    unblock: {
      enabled: true,
      source: 'ytdl, bilibili, pyncm, kugou',
      enableFlac: false,
      proxyUri: '',
      searchMode: 'fast-first',
      jooxCookie: '',
      qqCookie: '',
      ytDlExe: '',
    },
    lx: {
      enabled: false,
      source: 'kw',
      scriptUrl: '',
      timeoutMs: 15000,
      cacheMs: 600000,
      sources: [],
    },
  },
};

let _config = null;

export function loadConfig() {
  if (_config) return _config;
  ensureStorageDir();
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    _config = normalizeConfig(JSON.parse(raw));
    saveConfig(_config);
  } catch {
    _config = normalizeConfig({});
    saveConfig(_config);
  }
  return _config;
}

export function saveConfig(config) {
  ensureStorageDir();
  _config = normalizeConfig(config);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(_config, null, 2), 'utf-8');
}

export function getConfig() {
  return _config || loadConfig();
}

export function reloadConfig() {
  _config = null;
  return loadConfig();
}

export function getConfigPath() {
  return CONFIG_PATH;
}

function normalizeConfig(config) {
  const normalized = deepMerge(DEFAULT_CONFIG, config || {});
  if (normalized.audio?.lx) {
    delete normalized.audio.lx.scriptPath;
    if (Array.isArray(normalized.audio.lx.sources)) {
      normalized.audio.lx.sources = normalized.audio.lx.sources.map(source => {
        const { scriptPath: _scriptPath, ...rest } = source || {};
        return rest;
      });
    }
  }
  return normalized;
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(base[key] || {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

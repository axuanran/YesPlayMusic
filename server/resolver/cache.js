// File-based resolver cache
// Key: trackId:quality:provider
// Stores resolved playUrl + metadata in storage/cache.json

import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config.js';
import { getStoragePath } from '../storagePaths.js';

const CACHE_PATH = getStoragePath('cache.json');

function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return {};
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeCache(data) {
  try {
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Silent fail
  }
}

export function cacheKey(trackId, quality, provider) {
  return `${trackId}:${quality || 'standard'}:${provider || 'unknown'}`;
}

export function getCached(trackId, quality, provider) {
  const data = readCache();
  const key = cacheKey(trackId, quality, provider);
  const entry = data[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete data[key];
    writeCache(data);
    return null;
  }
  return entry;
}

export function setCache(trackId, quality, provider, value) {
  const config = getConfig();
  const ttl = (config.audio?.cacheTtl || 1800) * 1000;
  const data = readCache();
  const key = cacheKey(trackId, quality, provider);
  data[key] = {
    ...value,
    cachedAt: Date.now(),
    expiresAt: Date.now() + ttl,
  };
  writeCache(data);
}

export function deleteCache(trackId, quality, provider) {
  const data = readCache();
  const key = cacheKey(trackId, quality, provider);
  if (!data[key]) return false;
  delete data[key];
  writeCache(data);
  return true;
}

export function clearCache() {
  writeCache({});
}

export function cacheSize() {
  const data = readCache();
  const now = Date.now();
  let count = 0;
  for (const entry of Object.values(data)) {
    if (entry.expiresAt > now) count++;
  }
  return count;
}

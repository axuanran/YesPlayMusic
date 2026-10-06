import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const CACHE_LOCATION_STATE_FILENAME = 'cache-location.json';

// Web-storage entries Chromium creates under the default userData directory
// for the main window session (IndexedDB track cache, HTTP cache, ...).
// Only the entries that actually exist are relocated.
export const DEFAULT_SESSION_STORAGE_ENTRIES = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'GrShaderCache',
  'ShaderCache',
  'IndexedDB',
  'Local Storage',
  'Session Storage',
  'Service Worker',
  'blob_storage',
  'databases',
  'Shared Storage',
];

export const RELOCATION_MODES = ['move', 'delete'];

const isCaseInsensitiveFileSystem =
  process.platform === 'win32' || process.platform === 'darwin';

export class CacheLocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CacheLocationError';
    this.code = code;
  }
}

function normalizePathForCompare(value) {
  const normalized = path.resolve(value);
  return isCaseInsensitiveFileSystem ? normalized.toLowerCase() : normalized;
}

export function isSameOrInside(child, parent) {
  const childPath = normalizePathForCompare(child);
  const parentPath = normalizePathForCompare(parent);
  return (
    childPath === parentPath || childPath.startsWith(parentPath + path.sep)
  );
}

export function getCacheLocationStatePath(userDataDir) {
  return path.join(userDataDir, CACHE_LOCATION_STATE_FILENAME);
}

function emptyState() {
  return { version: 1, location: null, pending: null };
}

export function normalizeCacheLocationState(raw) {
  const state = emptyState();
  if (!raw || typeof raw !== 'object') return state;
  if (typeof raw.location === 'string' && raw.location) {
    state.location = raw.location;
  }
  if (raw.pending && typeof raw.pending === 'object') {
    const { location, mode } = raw.pending;
    if (
      typeof location === 'string' &&
      location &&
      RELOCATION_MODES.includes(mode)
    ) {
      state.pending = { location, mode };
    }
  }
  return state;
}

export function readCacheLocationStateSync(userDataDir) {
  try {
    const raw = fs.readFileSync(getCacheLocationStatePath(userDataDir), 'utf8');
    return normalizeCacheLocationState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export async function readCacheLocationState(userDataDir) {
  try {
    const raw = await fsp.readFile(
      getCacheLocationStatePath(userDataDir),
      'utf8'
    );
    return normalizeCacheLocationState(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

export async function writeCacheLocationState(userDataDir, state) {
  const normalized = normalizeCacheLocationState(state);
  await fsp.mkdir(userDataDir, { recursive: true });
  await fsp.writeFile(
    getCacheLocationStatePath(userDataDir),
    JSON.stringify(normalized, null, 2),
    'utf8'
  );
  return normalized;
}

// What the renderer displays in settings.
export function getCacheLocationInfo(userDataDir) {
  const state = readCacheLocationStateSync(userDataDir);
  return {
    // null means the default session storage under userData is in use.
    location: state.location,
    isCustom: Boolean(state.location),
    defaultLocation: userDataDir,
    pending: state.pending,
  };
}

// Returns null when the target is valid, otherwise an error code:
// 'invalid' (not an absolute path), 'same' (identical to the current
// location) or 'nested' (target contains, or is contained by, the current
// storage).
export function validateRelocationTarget({
  targetDir,
  userDataDir,
  currentLocation,
}) {
  if (typeof targetDir !== 'string' || !path.isAbsolute(targetDir)) {
    return 'invalid';
  }
  const target = path.resolve(targetDir);
  if (currentLocation) {
    if (
      normalizePathForCompare(target) ===
      normalizePathForCompare(currentLocation)
    ) {
      return 'same';
    }
    if (
      isSameOrInside(target, currentLocation) ||
      isSameOrInside(currentLocation, target)
    ) {
      return 'nested';
    }
  } else if (isSameOrInside(target, userDataDir)) {
    // Default storage lives inside userData; keep the target outside of it.
    return 'nested';
  }
  return null;
}

// Validates the request and persists it as a pending relocation. The actual
// file operations run on the next startup (runPendingRelocation), because the
// session storage files must not be in use while they are moved or deleted.
export async function prepareRelocation(userDataDir, { targetDir, mode } = {}) {
  if (!RELOCATION_MODES.includes(mode)) {
    throw new CacheLocationError(
      'invalidMode',
      `Unsupported cache relocation mode: ${mode}`
    );
  }
  const state = await readCacheLocationState(userDataDir);
  const errorCode = validateRelocationTarget({
    targetDir,
    userDataDir,
    currentLocation: state.location,
  });
  if (errorCode) {
    throw new CacheLocationError(
      errorCode,
      `Invalid cache relocation target: ${errorCode}`
    );
  }
  const next = {
    ...state,
    pending: { location: path.resolve(targetDir), mode },
  };
  await writeCacheLocationState(userDataDir, next);
  return next;
}

async function copyDirectory(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const linkTarget = await fsp.readlink(srcPath);
      await fsp.symlink(linkTarget, destPath);
    }
  }
}

export async function moveDirectory(src, dest) {
  try {
    await fsp.rename(src, dest);
    return;
  } catch (error) {
    // EXDEV: cross-device move. EPERM/EBUSY: locks (e.g. antivirus).
    // ENOTEMPTY/EEXIST: destination already has an entry with this name —
    // fall through to copy + remove so existing files get overwritten.
    if (
      !['EXDEV', 'EPERM', 'EBUSY', 'ENOTEMPTY', 'EEXIST'].includes(error?.code)
    ) {
      throw error;
    }
  }
  await copyDirectory(src, dest);
  await fsp.rm(src, { recursive: true, force: true });
}

async function removePath(target) {
  await fsp.rm(target, { recursive: true, force: true });
}

// The storage entries to relocate. With a custom location the whole
// directory was created for the session; with the default location only the
// known Chromium storage entries are touched, never the whole userData dir.
async function listSourceEntries(userDataDir, currentLocation) {
  if (currentLocation) {
    try {
      const entries = await fsp.readdir(currentLocation, {
        withFileTypes: true,
      });
      return entries.map(entry => ({
        name: entry.name,
        path: path.join(currentLocation, entry.name),
      }));
    } catch (error) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }
  const existing = [];
  for (const name of DEFAULT_SESSION_STORAGE_ENTRIES) {
    const entryPath = path.join(userDataDir, name);
    if (fs.existsSync(entryPath)) {
      existing.push({ name, path: entryPath });
    }
  }
  return existing;
}

// Executes a pending relocation at startup, before any window (and therefore
// any session using the storage) is created. Failures abort the relocation
// and keep the previous location so the app can still start.
export async function runPendingRelocation(userDataDir, { log } = {}) {
  const state = await readCacheLocationState(userDataDir);
  if (!state.pending) return { applied: false };

  const { location: target, mode } = state.pending;
  try {
    await fsp.mkdir(target, { recursive: true });
    // Defensive: never relocate a directory into itself.
    if (
      state.location &&
      normalizePathForCompare(state.location) ===
        normalizePathForCompare(target)
    ) {
      const next = { ...state, location: target, pending: null };
      await writeCacheLocationState(userDataDir, next);
      return { applied: true, mode, location: target };
    }
    const entries = await listSourceEntries(userDataDir, state.location);
    for (const entry of entries) {
      const dest = path.join(target, entry.name);
      if (mode === 'move') {
        await moveDirectory(entry.path, dest);
      } else {
        await removePath(entry.path);
      }
    }
    if (state.location) await removePath(state.location);

    const next = { ...state, location: target, pending: null };
    await writeCacheLocationState(userDataDir, next);
    log?.(`cache relocated to ${target} (mode: ${mode})`);
    return { applied: true, mode, location: target };
  } catch (error) {
    try {
      await writeCacheLocationState(userDataDir, { ...state, pending: null });
    } catch {
      // keep going; the app must still be able to start
    }
    log?.(`cache relocation failed: ${error?.message || error}`);
    return { applied: false, error };
  }
}

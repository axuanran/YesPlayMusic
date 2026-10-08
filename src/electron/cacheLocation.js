import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export const CACHE_LOCATION_STATE_FILENAME = 'cache-location.json';

// Cache entries that may live in a custom cache directory. The main window
// always keeps using the DEFAULT session rooted at userData, so login state
// and settings (Local Storage / Session Storage) stay in place; only these
// cache directories are relocated, with a filesystem link (NTFS junction on
// Windows, symlink elsewhere) left behind at the original path, which
// Chromium follows transparently.
export const CACHE_ENTRIES = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'GrShaderCache',
  'ShaderCache',
  'blob_storage',
  'IndexedDB',
];

// Pure web state that must never be relocated or deleted. Only used to
// recognize and recover the legacy layout where the whole session (including
// these entries) had been moved to the custom location.
export const STATE_ENTRIES = [
  'Local Storage',
  'Session Storage',
  'Service Worker',
  'databases',
  'Shared Storage',
];

export const RELOCATION_MODES = ['move', 'delete'];

const isCaseInsensitiveFileSystem =
  process.platform === 'win32' || process.platform === 'darwin';

const LINK_TYPE = process.platform === 'win32' ? 'junction' : 'dir';

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
    const validLocation =
      location === null || (typeof location === 'string' && location);
    if (validLocation && RELOCATION_MODES.includes(mode)) {
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
    // null means the cache entries live directly under userData.
    location: state.location,
    isCustom: Boolean(state.location),
    defaultLocation: userDataDir,
    pending: state.pending,
  };
}

// Returns null when the target is valid, otherwise an error code:
// 'invalid' (no absolute path and no default restore), 'same' (identical to
// the current location), 'nested' (target contains, or is contained by, the
// current storage). A null targetDir restores the default location and is
// only valid while a custom location is active.
export function validateRelocationTarget({
  targetDir,
  userDataDir,
  currentLocation,
}) {
  if (targetDir === null || targetDir === undefined) {
    return currentLocation ? null : 'invalid';
  }
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
// cache directories must not be in use while they are moved or deleted.
export async function prepareRelocation(
  userDataDir,
  { targetDir = null, mode } = {}
) {
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
    pending: {
      location: targetDir ? path.resolve(targetDir) : null,
      mode,
    },
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

async function isLink(target) {
  try {
    const stat = await fsp.lstat(target);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function createCacheLink(userDataDir, name, cacheRoot) {
  const linkPath = path.join(userDataDir, name);
  const targetPath = path.join(cacheRoot, name);
  await fsp.mkdir(targetPath, { recursive: true });
  await fsp.symlink(targetPath, linkPath, LINK_TYPE);
}

async function removeCacheLinks(userDataDir) {
  for (const name of CACHE_ENTRIES) {
    const linkPath = path.join(userDataDir, name);
    if (await isLink(linkPath)) {
      await fsp.unlink(linkPath);
    }
  }
}

// Ensures every cache entry is reachable from the default session directory:
// a leftover real directory is folded into the real cache root first, then a
// link is created. Already-linked entries are left untouched.
async function ensureCacheLinks(userDataDir, cacheRoot) {
  for (const name of CACHE_ENTRIES) {
    const linkPath = path.join(userDataDir, name);
    if (await isLink(linkPath)) continue;
    if (fs.existsSync(linkPath)) {
      await moveDirectory(linkPath, path.join(cacheRoot, name));
    }
    await createCacheLink(userDataDir, name, cacheRoot);
  }
}

// Brings the on-disk layout in line with the recorded state on every
// startup, before any window exists:
// - recovers the legacy whole-session relocation by moving state entries
//   (Local Storage, ...) back into the default userData session — login and
//   settings must live there, never in the cache directory;
// - establishes (or removes) the cache links for the current location.
// Never throws: a broken cache location must not prevent the app from
// starting, Chromium simply recreates missing cache directories.
export async function normalizeCacheLayout(userDataDir, { log } = {}) {
  const state = await readCacheLocationState(userDataDir);
  if (!state.location) {
    await removeCacheLinks(userDataDir);
    return state;
  }

  const legacyStateEntry = path.join(state.location, 'Local Storage');
  if (fs.existsSync(legacyStateEntry)) {
    for (const name of STATE_ENTRIES) {
      const src = path.join(state.location, name);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(userDataDir, name);
      // The relocated session was authoritative; drop stale default remnants.
      await removePath(dest);
      await moveDirectory(src, dest);
    }
    log?.('restored login/settings storage to the default location');
  }

  await ensureCacheLinks(userDataDir, state.location);
  return state;
}

function isDefaultRestore(target, userDataDir) {
  return (
    target === null ||
    normalizePathForCompare(path.resolve(target)) ===
      normalizePathForCompare(userDataDir)
  );
}

async function clearCacheEntries(root) {
  for (const name of CACHE_ENTRIES) {
    const entry = path.join(root, name);
    await removePath(entry);
    await fsp.mkdir(entry, { recursive: true });
  }
}

// Executes a pending relocation at startup, after the layout has been
// normalized and before any window (and therefore any session using the
// storage) is created. Only cache entries are touched; web state stays in
// the default userData session. Failures abort the relocation and keep the
// previous location so the app can still start.
export async function runPendingRelocation(userDataDir, { log } = {}) {
  let state;
  try {
    state = await normalizeCacheLayout(userDataDir, { log });
  } catch (error) {
    log?.(`cache layout normalization failed: ${error?.message || error}`);
    return { applied: false, error };
  }
  if (!state.pending) return { applied: false };

  const { location: rawTarget, mode } = state.pending;
  const restoreDefault = isDefaultRestore(rawTarget, userDataDir);
  const target = restoreDefault ? null : path.resolve(rawTarget);
  const oldRoot = state.location;
  try {
    if (mode === 'move') {
      if (restoreDefault) {
        // Fold the custom cache back into userData as real directories.
        await removeCacheLinks(userDataDir);
        for (const name of CACHE_ENTRIES) {
          const src = path.join(oldRoot, name);
          const dest = path.join(userDataDir, name);
          if (fs.existsSync(src)) {
            await moveDirectory(src, dest);
          }
        }
        await removePath(oldRoot);
      } else {
        await fsp.mkdir(target, { recursive: true });
        await removeCacheLinks(userDataDir);
        for (const name of CACHE_ENTRIES) {
          const src = oldRoot
            ? path.join(oldRoot, name)
            : path.join(userDataDir, name);
          const dest = path.join(target, name);
          if (fs.existsSync(src) && src !== dest) {
            await moveDirectory(src, dest);
          } else {
            await fsp.mkdir(dest, { recursive: true });
          }
        }
        if (oldRoot) await removePath(oldRoot);
        for (const name of CACHE_ENTRIES) {
          await createCacheLink(userDataDir, name, target);
        }
      }
    } else {
      // delete: wipe the cache contents (never the web state) and continue
      // at a fresh root — the custom target, or the default location.
      const rootToClear = oldRoot ?? userDataDir;
      await removeCacheLinks(userDataDir);
      await clearCacheEntries(rootToClear);
      if (oldRoot) await removePath(oldRoot);
      if (!restoreDefault) {
        await fsp.mkdir(target, { recursive: true });
        for (const name of CACHE_ENTRIES) {
          await createCacheLink(userDataDir, name, target);
        }
      }
    }

    const next = { ...state, location: target, pending: null };
    await writeCacheLocationState(userDataDir, next);
    log?.(
      `cache ${mode} applied${target ? ` -> ${target}` : ' (default location)'}`
    );
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

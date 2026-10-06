import { existsSync } from 'node:fs';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CacheLocationError,
  getCacheLocationInfo,
  moveDirectory,
  prepareRelocation,
  readCacheLocationState,
  runPendingRelocation,
  validateRelocationTarget,
  writeCacheLocationState,
} from '@/electron/cacheLocation';

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

describe('cacheLocation', () => {
  let root;
  let userDataDir;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ypm-cache-location-'));
    userDataDir = path.join(root, 'userData');
    await mkdir(userDataDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('state persistence', () => {
    it('round-trips a valid state', async () => {
      const target = path.join(root, 'new-cache');
      const written = await writeCacheLocationState(userDataDir, {
        version: 1,
        location: target,
        pending: { location: target, mode: 'move' },
      });
      expect(written.location).toBe(target);
      expect(written.pending).toEqual({ location: target, mode: 'move' });

      const read = await readCacheLocationState(userDataDir);
      expect(read).toEqual({
        version: 1,
        location: target,
        pending: { location: target, mode: 'move' },
      });
    });

    it('returns the default state for a missing or corrupt file', async () => {
      expect(await readCacheLocationState(userDataDir)).toEqual({
        version: 1,
        location: null,
        pending: null,
      });

      await writeFile(
        path.join(userDataDir, 'cache-location.json'),
        'not-json{{{',
        'utf8'
      );
      expect(await readCacheLocationState(userDataDir)).toEqual({
        version: 1,
        location: null,
        pending: null,
      });
    });

    it('drops malformed fields when normalizing', async () => {
      await writeFile(
        path.join(userDataDir, 'cache-location.json'),
        JSON.stringify({
          location: 42,
          pending: { location: 'C:\\x', mode: 'explode' },
        }),
        'utf8'
      );
      const state = await readCacheLocationState(userDataDir);
      expect(state.location).toBeNull();
      expect(state.pending).toBeNull();
    });

    it('reports info for display', async () => {
      const info = getCacheLocationInfo(userDataDir);
      expect(info.isCustom).toBe(false);
      expect(info.location).toBeNull();
      expect(info.defaultLocation).toBe(userDataDir);

      const target = path.join(root, 'custom');
      await writeCacheLocationState(userDataDir, {
        location: target,
        pending: null,
      });
      const custom = getCacheLocationInfo(userDataDir);
      expect(custom.isCustom).toBe(true);
      expect(custom.location).toBe(target);
    });
  });

  describe('validateRelocationTarget', () => {
    it('rejects relative paths', () => {
      expect(
        validateRelocationTarget({
          targetDir: 'some/relative/dir',
          userDataDir,
          currentLocation: null,
        })
      ).toBe('invalid');
      expect(
        validateRelocationTarget({
          targetDir: '',
          userDataDir,
          currentLocation: null,
        })
      ).toBe('invalid');
    });

    it('rejects targets inside the default userData storage', () => {
      const inside = path.join(userDataDir, 'CacheDrive');
      expect(
        validateRelocationTarget({
          targetDir: inside,
          userDataDir,
          currentLocation: null,
        })
      ).toBe('nested');
      expect(
        validateRelocationTarget({
          targetDir: userDataDir,
          userDataDir,
          currentLocation: null,
        })
      ).toBe('nested');
      expect(
        validateRelocationTarget({
          targetDir: path.join(root, 'elsewhere'),
          userDataDir,
          currentLocation: null,
        })
      ).toBeNull();
    });

    it('rejects same and nested targets for a custom location', () => {
      const current = path.join(root, 'current');
      expect(
        validateRelocationTarget({
          targetDir: current,
          userDataDir,
          currentLocation: current,
        })
      ).toBe('same');
      expect(
        validateRelocationTarget({
          targetDir: path.join(current, 'sub'),
          userDataDir,
          currentLocation: current,
        })
      ).toBe('nested');
      expect(
        validateRelocationTarget({
          targetDir: path.dirname(current),
          userDataDir,
          currentLocation: current,
        })
      ).toBe('nested');
      expect(
        validateRelocationTarget({
          targetDir: path.join(root, 'sibling'),
          userDataDir,
          currentLocation: current,
        })
      ).toBeNull();
    });
  });

  describe('prepareRelocation', () => {
    it('rejects unsupported modes', async () => {
      await expect(
        prepareRelocation(userDataDir, {
          targetDir: path.join(root, 'x'),
          mode: 'explode',
        })
      ).rejects.toMatchObject({ code: 'invalidMode' });
    });

    it('persists a pending relocation', async () => {
      const target = path.join(root, 'target');
      const state = await prepareRelocation(userDataDir, {
        targetDir: target,
        mode: 'move',
      });
      expect(state.pending).toEqual({ location: target, mode: 'move' });
      expect((await readCacheLocationState(userDataDir)).pending).toEqual({
        location: target,
        mode: 'move',
      });
    });

    it('throws a coded error for invalid targets', async () => {
      try {
        await prepareRelocation(userDataDir, {
          targetDir: path.join(userDataDir, 'inside'),
          mode: 'move',
        });
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(CacheLocationError);
        expect(error.code).toBe('nested');
      }
    });
  });

  describe('moveDirectory', () => {
    it('copies content when rename fails', async () => {
      const src = path.join(root, 'src');
      const dest = path.join(root, 'dest');
      await mkdir(path.join(src, 'nested'), { recursive: true });
      await writeFile(path.join(src, 'nested', 'a.bin'), 'data');
      // Force the rename fallback by pre-creating the destination.
      await mkdir(dest, { recursive: true });
      await moveDirectory(src, dest);
      expect(await pathExists(path.join(dest, 'nested', 'a.bin'))).toBe(true);
      expect(existsSync(src)).toBe(false);
    });
  });

  describe('runPendingRelocation', () => {
    it('does nothing without a pending relocation', async () => {
      const result = await runPendingRelocation(userDataDir);
      expect(result.applied).toBe(false);
    });

    it('moves default session storage entries to the target', async () => {
      await mkdir(path.join(userDataDir, 'IndexedDB'), { recursive: true });
      await writeFile(path.join(userDataDir, 'IndexedDB', 'track.bin'), 'x');
      await mkdir(path.join(userDataDir, 'Cache'), { recursive: true });
      await writeFile(path.join(userDataDir, 'Cache', 'c.bin'), 'y');
      // Must never be touched.
      await writeFile(path.join(userDataDir, 'config.json'), '{}');

      const target = path.join(root, 'moved-cache');
      await prepareRelocation(userDataDir, { targetDir: target, mode: 'move' });

      const result = await runPendingRelocation(userDataDir);
      expect(result).toMatchObject({
        applied: true,
        mode: 'move',
        location: target,
      });

      expect(
        await readFile(path.join(target, 'IndexedDB', 'track.bin'), 'utf8')
      ).toBe('x');
      expect(await readFile(path.join(target, 'Cache', 'c.bin'), 'utf8')).toBe(
        'y'
      );
      expect(existsSync(path.join(userDataDir, 'IndexedDB'))).toBe(false);
      expect(existsSync(path.join(userDataDir, 'Cache'))).toBe(false);
      expect(
        await readFile(path.join(userDataDir, 'config.json'), 'utf8')
      ).toBe('{}');

      const state = await readCacheLocationState(userDataDir);
      expect(state.location).toBe(target);
      expect(state.pending).toBeNull();
    });

    it('moves a custom location into the new target', async () => {
      const oldLocation = path.join(root, 'old-cache');
      await mkdir(path.join(oldLocation, 'Local Storage'), { recursive: true });
      await writeFile(
        path.join(oldLocation, 'Local Storage', 'leveldb.bin'),
        'z'
      );
      await writeCacheLocationState(userDataDir, {
        location: oldLocation,
        pending: null,
      });

      const target = path.join(root, 'new-cache');
      await prepareRelocation(userDataDir, { targetDir: target, mode: 'move' });

      const result = await runPendingRelocation(userDataDir);
      expect(result.applied).toBe(true);
      expect(
        await readFile(
          path.join(target, 'Local Storage', 'leveldb.bin'),
          'utf8'
        )
      ).toBe('z');
      expect(existsSync(oldLocation)).toBe(false);

      const state = await readCacheLocationState(userDataDir);
      expect(state.location).toBe(target);
    });

    it('deletes a custom location instead of moving it', async () => {
      const oldLocation = path.join(root, 'old-cache');
      await mkdir(path.join(oldLocation, 'IndexedDB'), { recursive: true });
      await writeFile(path.join(oldLocation, 'IndexedDB', 't.bin'), 'x');
      await writeCacheLocationState(userDataDir, {
        location: oldLocation,
        pending: null,
      });

      const target = path.join(root, 'fresh-cache');
      await prepareRelocation(userDataDir, {
        targetDir: target,
        mode: 'delete',
      });

      const result = await runPendingRelocation(userDataDir);
      expect(result).toMatchObject({ applied: true, mode: 'delete' });
      expect(existsSync(oldLocation)).toBe(false);
      expect(existsSync(target)).toBe(true);

      const state = await readCacheLocationState(userDataDir);
      expect(state.location).toBe(target);
      expect(state.pending).toBeNull();
    });

    it('aborts on failure and keeps the previous location', async () => {
      const oldLocation = path.join(root, 'old-cache');
      await mkdir(path.join(oldLocation, 'IndexedDB'), { recursive: true });
      await writeFile(path.join(oldLocation, 'IndexedDB', 't.bin'), 'x');
      await writeCacheLocationState(userDataDir, {
        location: oldLocation,
        pending: null,
      });

      // Block the target by placing a file at that path so mkdir fails.
      const target = path.join(root, 'blocked');
      await mkdir(root, { recursive: true });
      await writeFile(target, 'i am a file');

      const logs = [];
      await prepareRelocation(userDataDir, { targetDir: target, mode: 'move' });
      const result = await runPendingRelocation(userDataDir, {
        log: message => logs.push(message),
      });

      expect(result.applied).toBe(false);
      expect(result.error).toBeTruthy();
      expect(logs.some(message => message.includes('failed'))).toBe(true);

      // Old storage and location survive; the pending request is cleared so
      // the app does not retry forever.
      expect(
        await readFile(path.join(oldLocation, 'IndexedDB', 't.bin'), 'utf8')
      ).toBe('x');
      const state = await readCacheLocationState(userDataDir);
      expect(state.location).toBe(oldLocation);
      expect(state.pending).toBeNull();
    });
  });
});

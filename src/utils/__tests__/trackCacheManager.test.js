import { describe, expect, it, vi } from 'vitest';
import { createTrackCacheManager } from '@/utils/trackCacheManager';

function createTable(initialTracks = []) {
  const tracks = new Map(initialTracks.map(track => [track.id, track]));
  return {
    clear: vi.fn(async () => tracks.clear()),
    count: vi.fn(async () => tracks.size),
    delete: vi.fn(async id => tracks.delete(id)),
    get: vi.fn(async id => tracks.get(id)),
    orderBy: vi.fn(() => {
      const sortedTracks = () =>
        [...tracks.values()].sort(
          (left, right) => left.createTime - right.createTime
        );
      return {
        first: async () => sortedTracks()[0],
        reverse: () => ({
          primaryKeys: async () =>
            sortedTracks()
              .reverse()
              .map(track => track.id),
        }),
      };
    }),
    put: vi.fn(async track => tracks.set(track.id, track)),
    toArray: vi.fn(async () => [...tracks.values()]),
  };
}

const createTrack = (id, bytes, createTime = id) => ({
  id,
  createTime,
  source: { byteLength: bytes },
});

describe('track cache manager', () => {
  it('evicts oldest tracks until startup data is within the limit', async () => {
    const table = createTable([
      createTrack(1, 600 * 1024, 1),
      createTrack(2, 600 * 1024, 2),
    ]);
    const manager = createTrackCacheManager({
      table,
      getCacheLimit: () => 1,
    });

    await expect(manager.initialize()).resolves.toEqual({
      bytes: 600 * 1024,
      deleted: 1,
      length: 1,
    });
    expect(table.delete).toHaveBeenCalledWith(1);
  });

  it('waits for writes and replaces the previous byte count', async () => {
    const table = createTable([createTrack(1, 100)]);
    let finishWrite;
    table.put.mockImplementation(
      track =>
        new Promise(resolve => {
          finishWrite = () => {
            table.get.mockResolvedValue(track);
            resolve();
          };
        })
    );
    const manager = createTrackCacheManager({
      table,
      getCacheLimit: () => false,
    });
    await manager.initialize();

    let settled = false;
    const write = manager.put(createTrack(1, 250)).then(result => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(false);
    finishWrite();
    await expect(write).resolves.toMatchObject({ bytes: 250 });
  });

  it('serializes clear after a pending write and resets the count', async () => {
    const table = createTable();
    const manager = createTrackCacheManager({
      table,
      getCacheLimit: () => false,
    });
    const write = manager.put(createTrack(1, 250));
    const clear = manager.clearAll([table]);

    await write;
    await clear;

    await expect(manager.count()).resolves.toEqual({
      bytes: 0,
      length: 0,
    });
    expect(table.put.mock.invocationCallOrder[0]).toBeLessThan(
      table.clear.mock.invocationCallOrder[0]
    );
  });

  it('lists newest cache IDs without reading source values', async () => {
    const table = createTable([
      createTrack(1, 100, 10),
      createTrack(2, 200, 20),
    ]);
    const manager = createTrackCacheManager({
      table,
      getCacheLimit: () => false,
    });

    await expect(manager.listIds()).resolves.toEqual([2, 1]);
    expect(table.toArray).not.toHaveBeenCalled();
  });

  it('removes one cached track and updates logical totals', async () => {
    const table = createTable([createTrack(1, 100), createTrack(2, 200)]);
    const manager = createTrackCacheManager({
      table,
      getCacheLimit: () => false,
    });
    await manager.initialize();

    await expect(manager.remove(1)).resolves.toEqual({
      bytes: 200,
      deleted: 1,
      length: 1,
    });
    expect(table.delete).toHaveBeenCalledWith(1);
  });

  it('does not report success before every table is cleared', async () => {
    const table = createTable([createTrack(1, 100)]);
    let finishClear;
    table.clear.mockImplementation(
      () =>
        new Promise(resolve => {
          finishClear = resolve;
        })
    );
    const manager = createTrackCacheManager({
      table,
      getCacheLimit: () => false,
    });
    let settled = false;
    const clear = manager.clearAll([table]).then(result => {
      settled = true;
      return result;
    });

    while (!finishClear) {
      await Promise.resolve();
    }
    expect(settled).toBe(false);
    finishClear();
    await expect(clear).resolves.toEqual({ bytes: 0, length: 0 });
  });

  it('blocks writes until disk clearing finishes and the database reopens', async () => {
    const table = createTable([createTrack(1, 100)]);
    const manager = createTrackCacheManager({
      table,
      getCacheLimit: () => false,
    });
    let finishDiskClear;
    const clearDiskCache = vi.fn(
      () =>
        new Promise(resolve => {
          finishDiskClear = resolve;
        })
    );
    const openDatabase = vi.fn().mockResolvedValue();
    const clear = manager.clearAllDiskCache([table], {
      closeDatabase: vi.fn(),
      clearDiskCache,
      openDatabase,
    });

    while (!finishDiskClear) {
      await Promise.resolve();
    }
    const write = manager.put(createTrack(2, 200));
    await Promise.resolve();

    expect(table.put).not.toHaveBeenCalled();
    finishDiskClear();
    await clear;
    await write;
    expect(openDatabase).toHaveBeenCalledOnce();
    expect(table.put).toHaveBeenCalledWith(createTrack(2, 200));
  });

  it('reports failures and keeps later operations available', async () => {
    const error = new Error('write failed');
    const onError = vi.fn();
    const table = createTable();
    table.put.mockRejectedValueOnce(error);
    const manager = createTrackCacheManager({
      table,
      getCacheLimit: () => false,
      onError,
    });

    await expect(manager.put(createTrack(1, 100))).rejects.toThrow(
      'write failed'
    );
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith('cache write', error);
    await expect(manager.count()).resolves.toEqual({ bytes: 0, length: 0 });
  });
});

const MEBIBYTE = 1024 * 1024;

export function getTrackSourceBytes(track) {
  const bytes = track?.source?.byteLength;
  return Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
}

function getLimitBytes(limitMiB) {
  if (limitMiB === false) return null;
  const normalizedLimit = Number(limitMiB);
  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) return null;
  return normalizedLimit * MEBIBYTE;
}

export function createTrackCacheManager({
  table,
  getCacheLimit,
  onError = () => {},
}) {
  let operationQueue = Promise.resolve();
  let trackedBytes = 0;

  const serialize = (label, operation) => {
    const result = operationQueue.then(operation);
    operationQueue = result.catch(error => {
      onError(label, error);
    });
    return result;
  };

  const countUnlocked = async () => {
    const tracks = await table.toArray();
    trackedBytes = tracks.reduce(
      (total, track) => total + getTrackSourceBytes(track),
      0
    );
    return {
      bytes: trackedBytes,
      length: tracks.length,
    };
  };

  const evictUnlocked = async limitMiB => {
    const limitBytes = getLimitBytes(limitMiB);
    let deleted = 0;

    while (limitBytes !== null && trackedBytes > limitBytes) {
      const oldestTrack = await table.orderBy('createTime').first();
      if (!oldestTrack) {
        trackedBytes = 0;
        break;
      }

      await table.delete(oldestTrack.id);
      trackedBytes = Math.max(
        0,
        trackedBytes - getTrackSourceBytes(oldestTrack)
      );
      deleted += 1;
    }

    return {
      bytes: trackedBytes,
      deleted,
      length: await table.count(),
    };
  };

  return {
    initialize() {
      return serialize('startup scan', async () => {
        await countUnlocked();
        return evictUnlocked(getCacheLimit());
      });
    },

    put(track) {
      return serialize('cache write', async () => {
        const previousTrack = await table.get(track.id);
        await table.put(track);
        trackedBytes = Math.max(
          0,
          trackedBytes -
            getTrackSourceBytes(previousTrack) +
            getTrackSourceBytes(track)
        );
        return evictUnlocked(getCacheLimit());
      });
    },

    count() {
      return serialize('cache count', countUnlocked);
    },

    listIds() {
      return serialize('cache list', () =>
        table.orderBy('createTime').reverse().primaryKeys()
      );
    },

    remove(id) {
      return serialize('cache remove', async () => {
        const track = await table.get(id);
        if (!track) {
          return {
            bytes: trackedBytes,
            deleted: 0,
            length: await table.count(),
          };
        }
        await table.delete(id);
        trackedBytes = Math.max(0, trackedBytes - getTrackSourceBytes(track));
        return {
          bytes: trackedBytes,
          deleted: 1,
          length: await table.count(),
        };
      });
    },

    enforceLimit(limitMiB = getCacheLimit()) {
      return serialize('cache eviction', async () => {
        await countUnlocked();
        return evictUnlocked(limitMiB);
      });
    },

    clearAll(tables, closeDatabase) {
      return serialize('cache clear', async () => {
        await Promise.all(tables.map(currentTable => currentTable.clear()));
        trackedBytes = 0;
        closeDatabase?.();
        return { bytes: 0, length: 0 };
      });
    },

    clearAllDiskCache(tables, { closeDatabase, clearDiskCache, openDatabase }) {
      return serialize('disk cache clear', async () => {
        await Promise.all(tables.map(currentTable => currentTable.clear()));
        trackedBytes = 0;
        closeDatabase();
        try {
          await clearDiskCache();
        } finally {
          await openDatabase();
        }
        return countUnlocked();
      });
    },
  };
}

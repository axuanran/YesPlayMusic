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
  let initialized = false;
  let trackedBytes = 0;
  let trackedLength = 0;

  const serialize = (label, operation) => {
    const result = operationQueue.then(operation);
    operationQueue = result.catch(error => {
      onError(label, error);
    });
    return result;
  };

  const snapshot = () => ({
    bytes: trackedBytes,
    length: trackedLength,
  });

  const ensureInitializedUnlocked = async () => {
    if (initialized) return;
    const tracks = await table.toArray();
    trackedBytes = tracks.reduce(
      (total, track) => total + getTrackSourceBytes(track),
      0
    );
    trackedLength = tracks.length;
    initialized = true;
  };

  const evictUnlocked = async limitMiB => {
    const limitBytes = getLimitBytes(limitMiB);
    let deleted = 0;

    while (limitBytes !== null && trackedBytes > limitBytes) {
      const oldestTrack = await table.orderBy('createTime').first();
      if (!oldestTrack) {
        trackedBytes = 0;
        trackedLength = 0;
        break;
      }

      await table.delete(oldestTrack.id);
      trackedBytes = Math.max(
        0,
        trackedBytes - getTrackSourceBytes(oldestTrack)
      );
      trackedLength = Math.max(0, trackedLength - 1);
      deleted += 1;
    }

    return {
      ...snapshot(),
      deleted,
    };
  };

  return {
    initialize() {
      return serialize('startup scan', async () => {
        if (!initialized) await ensureInitializedUnlocked();
        return evictUnlocked(getCacheLimit());
      });
    },

    put(track) {
      return serialize('cache write', async () => {
        if (!initialized) await ensureInitializedUnlocked();
        const previousTrack = await table.get(track.id);
        await table.put(track);
        trackedBytes = Math.max(
          0,
          trackedBytes -
            getTrackSourceBytes(previousTrack) +
            getTrackSourceBytes(track)
        );
        if (!previousTrack) trackedLength += 1;
        return evictUnlocked(getCacheLimit());
      });
    },

    count() {
      return serialize('cache count', async () => {
        if (!initialized) await ensureInitializedUnlocked();
        return snapshot();
      });
    },

    listIds() {
      const result = Promise.resolve().then(() =>
        table.orderBy('createTime').reverse().primaryKeys()
      );
      return result.catch(error => {
        onError('cache list', error);
        throw error;
      });
    },

    remove(id) {
      return serialize('cache remove', async () => {
        if (!initialized) await ensureInitializedUnlocked();
        const track = await table.get(id);
        if (!track) {
          return {
            ...snapshot(),
            deleted: 0,
          };
        }
        await table.delete(id);
        trackedBytes = Math.max(0, trackedBytes - getTrackSourceBytes(track));
        trackedLength = Math.max(0, trackedLength - 1);
        return {
          ...snapshot(),
          deleted: 1,
        };
      });
    },

    enforceLimit(limitMiB = getCacheLimit()) {
      return serialize('cache eviction', async () => {
        if (!initialized) await ensureInitializedUnlocked();
        return evictUnlocked(limitMiB);
      });
    },

    clearAll(tables, closeDatabase) {
      return serialize('cache clear', async () => {
        await Promise.all(tables.map(currentTable => currentTable.clear()));
        trackedBytes = 0;
        trackedLength = 0;
        initialized = true;
        closeDatabase?.();
        return snapshot();
      });
    },

    clearAllDiskCache(tables, { closeDatabase, clearDiskCache, openDatabase }) {
      return serialize('disk cache clear', async () => {
        await Promise.all(tables.map(currentTable => currentTable.clear()));
        trackedBytes = 0;
        trackedLength = 0;
        initialized = true;
        closeDatabase();
        try {
          await clearDiskCache();
        } finally {
          await openDatabase();
        }
        return snapshot();
      });
    },
  };
}

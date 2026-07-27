const CACHE_STORAGE_TYPES = [
  'indexdb',
  'filesystem',
  'shadercache',
  'serviceworkers',
  'cachestorage',
];

function getStorageOrigin(url) {
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}

export async function clearSessionDiskCache(targetSession, rendererUrl) {
  if (!targetSession?.clearCache || !targetSession?.clearStorageData) {
    throw new Error('Electron session cache API is unavailable');
  }

  const origin = getStorageOrigin(rendererUrl);
  const storageOptions = {
    storages: CACHE_STORAGE_TYPES,
    ...(origin ? { origin } : {}),
  };

  await targetSession.clearCache();
  await targetSession.clearStorageData(storageOptions);

  return { cleared: true };
}

export const HOME_FEED_REFRESH_INTERVAL = 5 * 60 * 1000;

export function shouldRefreshHomeFeed({
  force = false,
  feedKey,
  loadedAt,
  loadedFeedKey,
  now = Date.now(),
}) {
  if (force) return true;
  if (!loadedFeedKey || loadedFeedKey !== feedKey) return true;
  return now - loadedAt >= HOME_FEED_REFRESH_INTERVAL;
}

export function sampleHomeArtists(items, count, random = Math.random) {
  const pool = Array.isArray(items) ? [...items] : [];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, Math.max(0, count));
}

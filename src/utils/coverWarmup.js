const DEFAULT_SIZES = [224, 512, 1024];
const DEFAULT_CACHE_SIZE = 96;

export function createCoverWarmup(
  loadUrl,
  { maxEntries = DEFAULT_CACHE_SIZE, sizes = DEFAULT_SIZES } = {}
) {
  const cache = new Map();

  const loadOnce = url => {
    const cached = cache.get(url);
    if (cached) {
      cache.delete(url);
      cache.set(url, cached);
      return cached;
    }

    const pending = Promise.resolve()
      .then(() => loadUrl(url))
      .catch(error => {
        if (cache.get(url) === pending) cache.delete(url);
        throw error;
      });
    cache.set(url, pending);
    while (cache.size > Math.max(1, maxEntries)) {
      cache.delete(cache.keys().next().value);
    }
    return pending;
  };

  return cover => {
    if (!cover) return Promise.resolve([]);
    const separator = cover.includes('?') ? '&' : '?';
    return Promise.all(
      sizes.map(size => loadOnce(`${cover}${separator}param=${size}y${size}`))
    );
  };
}

const DEFAULT_CACHE_SIZE = 32;

export function createCachedCoverGradientLoader(
  extractGradient,
  maxEntries = DEFAULT_CACHE_SIZE
) {
  const cache = new Map();

  return (url, variant = 'darkMuted') => {
    if (!url) return Promise.resolve('');
    const key = `${variant}:${url}`;
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key);
      cache.set(key, cached);
      return cached;
    }

    const pending = Promise.resolve()
      .then(() => extractGradient(url, variant))
      .catch(error => {
        if (cache.get(key) === pending) cache.delete(key);
        throw error;
      });
    cache.set(key, pending);
    while (cache.size > Math.max(1, maxEntries)) {
      cache.delete(cache.keys().next().value);
    }
    return pending;
  };
}

async function extractCoverGradient(url, variant) {
  const [{ Vibrant }, colorModule] = await Promise.all([
    import('node-vibrant/browser'),
    import('color'),
  ]);
  const palette = await Vibrant.from(url, { colorCount: 1 }).getPalette();
  const swatch =
    variant === 'vibrant'
      ? palette.Vibrant || palette.DarkVibrant
      : palette.DarkMuted || palette.Muted;
  if (!swatch?._rgb) throw new Error(`No ${variant} cover color available`);

  const Color = colorModule.default;
  const origin = Color.rgb(swatch._rgb);
  const start = origin.darken(0.1).rgb().string();
  const end = origin.lighten(0.28).rotate(-30).rgb().string();
  return `linear-gradient(to top left, ${start}, ${end})`;
}

export const loadCoverGradient =
  createCachedCoverGradientLoader(extractCoverGradient);

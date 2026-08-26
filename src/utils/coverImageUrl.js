const LOOPBACK_HTTP_ORIGIN =
  /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i;

const FALLBACK_COVER = '';

/**
 * Resolve cover url from the response shapes used by the web API, the
 * Android built-in API and local/streaming tracks.
 */
export function resolveCoverImageUrl(source) {
  if (!source) return FALLBACK_COVER;

  if (typeof source === 'string') {
    return normalizeCoverUrl(source);
  }

  return normalizeCoverUrl(
    source.picUrl ||
      source.coverImgUrl ||
      source.coverUrl ||
      source.blurPicUrl ||
      source.al?.picUrl ||
      source.album?.picUrl ||
      source.album?.blurPicUrl ||
      source.simpleSong?.al?.picUrl ||
      source.song?.al?.picUrl ||
      source.song?.album?.picUrl ||
      source.artist?.picUrl ||
      source.avatarUrl ||
      ''
  );
}

export function createSizedCoverUrl(source, size = 300) {
  const normalizedUrl = resolveCoverImageUrl(source);
  if (!normalizedUrl) return '';

  const numericSize = Number.parseInt(size, 10);
  if (!Number.isFinite(numericSize) || numericSize <= 0) return normalizedUrl;

  const urlWithoutOldSize = normalizedUrl
    .replace(/([?&])param=\d+y\d+(?=&|$)/gi, '$1')
    .replace(/\?&/, '?')
    .replace(/&&+/g, '&')
    .replace(/[?&]$/, '');
  const separator = urlWithoutOldSize.includes('?') ? '&' : '?';
  return `${urlWithoutOldSize}${separator}param=${numericSize}y${numericSize}`;
}

function normalizeCoverUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return '';

  const trimmedUrl = imageUrl.trim();
  if (!trimmedUrl) return '';
  if (trimmedUrl.startsWith('//')) return `https:${trimmedUrl}`;

  return LOOPBACK_HTTP_ORIGIN.test(trimmedUrl)
    ? trimmedUrl
    : trimmedUrl.replace(/^http:\/\//i, 'https://');
}

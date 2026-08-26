const LOOPBACK_HTTP_ORIGIN =
  /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i;

const FALLBACK_COVER = '';

/**
 * Resolve cover url from different Netease response shapes.
 * Android API responses are not always identical to desktop responses.
 */
export function resolveCoverImageUrl(source) {
  if (!source) return FALLBACK_COVER;

  if (typeof source === 'string') {
    return normalizeCoverUrl(source);
  }

  return normalizeCoverUrl(
    source.picUrl ||
      source.coverImgUrl ||
      source.album?.picUrl ||
      source.al?.picUrl ||
      source.song?.album?.picUrl ||
      ''
  );
}

export function createSizedCoverUrl(imageUrl, size = 300) {
  const normalizedUrl = resolveCoverImageUrl(imageUrl);
  if (!normalizedUrl) return '';

  const separator = normalizedUrl.includes('?') ? '&' : '?';
  return `${normalizedUrl}${separator}param=${size}y${size}`;
}

function normalizeCoverUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return '';

  const normalizedUrl = LOOPBACK_HTTP_ORIGIN.test(imageUrl)
    ? imageUrl
    : imageUrl.replace(/^http:\/\//i, 'https://');

  return normalizedUrl;
}

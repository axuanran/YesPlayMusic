const LOOPBACK_HTTP_ORIGIN =
  /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/|$)/i;

export function createSizedCoverUrl(imageUrl, size) {
  if (!imageUrl) return '';
  const normalizedUrl = LOOPBACK_HTTP_ORIGIN.test(imageUrl)
    ? imageUrl
    : imageUrl.replace(/^http:\/\//i, 'https://');
  const separator = normalizedUrl.includes('?') ? '&' : '?';
  return `${normalizedUrl}${separator}param=${size}y${size}`;
}

export const VISIBLE_LYRICS_INTERVAL = 50;
export const BACKGROUND_LYRICS_INTERVAL = 250;

export function getLyricsClockInterval({
  showLyrics,
  desktopLyricsEnabled,
  documentHidden,
}) {
  if (!showLyrics && !desktopLyricsEnabled) return null;
  if (documentHidden || !showLyrics) return BACKGROUND_LYRICS_INTERVAL;
  return VISIBLE_LYRICS_INTERVAL;
}

export function findActiveLyricIndex(lines, progress) {
  if (!Array.isArray(lines) || lines.length === 0) return -1;
  const currentTime = Number(progress);
  if (!Number.isFinite(currentTime)) return -1;

  let low = 0;
  let high = lines.length - 1;
  let activeIndex = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineTime = Number(lines[middle]?.time);
    if (!Number.isFinite(lineTime) || lineTime > currentTime) {
      high = middle - 1;
    } else {
      activeIndex = middle;
      low = middle + 1;
    }
  }
  return activeIndex;
}

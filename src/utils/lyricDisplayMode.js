export const LYRIC_DISPLAY_MODE = Object.freeze({
  TRANSLATION: 'translation',
  PRONUNCIATION: 'romaPronunciation',
  BOTH: 'both',
  NONE: 'none',
});

export function getLyricDisplayModes({
  hasTranslation = false,
  hasPronunciation = false,
} = {}) {
  const modes = [];
  if (hasTranslation) modes.push(LYRIC_DISPLAY_MODE.TRANSLATION);
  if (hasPronunciation) modes.push(LYRIC_DISPLAY_MODE.PRONUNCIATION);
  if (hasTranslation && hasPronunciation) {
    modes.push(LYRIC_DISPLAY_MODE.BOTH);
  }
  modes.push(LYRIC_DISPLAY_MODE.NONE);
  return modes;
}

export function getNextLyricDisplayMode(modes, currentMode) {
  if (!Array.isArray(modes) || modes.length === 0) {
    return LYRIC_DISPLAY_MODE.NONE;
  }
  const currentIndex = modes.indexOf(currentMode);
  return modes[(currentIndex + 1) % modes.length];
}

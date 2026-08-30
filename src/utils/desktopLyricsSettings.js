export const DEFAULT_DESKTOP_LYRICS_SETTINGS = Object.freeze({
  enabled: true,
  visible: true,
  locked: true,
  alwaysOnTop: true,
  showSecondary: true,
  fontSize: 32,
  secondaryFontSize: 18,
  textAlign: 'center',
  overflowMode: 'ellipsis',
  positionPreset: 'custom',
  textColor: '#ffffff',
  secondaryColor: '#d6e0ff',
  backgroundOpacity: 0,
  width: 960,
  height: 120,
  x: null,
  y: null,
});

const ALIGNMENTS = new Set(['left', 'center', 'right']);
const OVERFLOW_MODES = new Set(['ellipsis', 'wrap']);
const POSITION_PRESETS = new Set([
  'custom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
};

const coordinate = value =>
  value !== null && value !== '' && Number.isFinite(Number(value))
    ? Math.round(Number(value))
    : null;

const color = (value, fallback) =>
  typeof value === 'string' && COLOR_PATTERN.test(value) ? value : fallback;

export function normalizeDesktopLyricsSettings(value = {}, legacyEnabled) {
  const source = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_DESKTOP_LYRICS_SETTINGS;
  const enabled =
    typeof source.enabled === 'boolean'
      ? source.enabled
      : typeof legacyEnabled === 'boolean'
        ? legacyEnabled
        : defaults.enabled;

  return {
    enabled,
    visible:
      typeof source.visible === 'boolean' ? source.visible : enabled === true,
    locked:
      typeof source.locked === 'boolean' ? source.locked : defaults.locked,
    alwaysOnTop:
      typeof source.alwaysOnTop === 'boolean'
        ? source.alwaysOnTop
        : defaults.alwaysOnTop,
    showSecondary:
      typeof source.showSecondary === 'boolean'
        ? source.showSecondary
        : defaults.showSecondary,
    fontSize: clamp(source.fontSize, 18, 72, defaults.fontSize),
    secondaryFontSize: clamp(
      source.secondaryFontSize,
      12,
      48,
      defaults.secondaryFontSize
    ),
    textAlign: ALIGNMENTS.has(source.textAlign)
      ? source.textAlign
      : defaults.textAlign,
    overflowMode: OVERFLOW_MODES.has(source.overflowMode)
      ? source.overflowMode
      : defaults.overflowMode,
    positionPreset: POSITION_PRESETS.has(source.positionPreset)
      ? source.positionPreset
      : defaults.positionPreset,
    textColor: color(source.textColor, defaults.textColor),
    secondaryColor: color(source.secondaryColor, defaults.secondaryColor),
    backgroundOpacity: clamp(
      source.backgroundOpacity,
      0,
      1,
      defaults.backgroundOpacity
    ),
    width: Math.round(clamp(source.width, 360, 1920, defaults.width)),
    height: Math.round(clamp(source.height, 92, 400, defaults.height)),
    x: coordinate(source.x),
    y: coordinate(source.y),
  };
}

export function mergeDesktopLyricsSettings(current, patch, legacyEnabled) {
  const safePatch = patch && typeof patch === 'object' ? patch : {};
  return normalizeDesktopLyricsSettings(
    {
      ...normalizeDesktopLyricsSettings(current, legacyEnabled),
      ...safePatch,
    },
    legacyEnabled
  );
}

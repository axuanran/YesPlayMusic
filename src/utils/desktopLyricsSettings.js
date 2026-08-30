export const DESKTOP_LYRICS_STYLE_KEYS = Object.freeze([
  'showSecondary',
  'fontSize',
  'secondaryFontSize',
  'textAlign',
  'overflowMode',
  'verticalPosition',
  'textColor',
  'secondaryColor',
  'backgroundOpacity',
]);

export const DEFAULT_DESKTOP_LYRICS_SETTINGS = Object.freeze({
  enabled: false,
  visible: false,
  locked: true,
  alwaysOnTop: true,
  showSecondary: true,
  fontSize: 32,
  secondaryFontSize: 18,
  textAlign: 'center',
  overflowMode: 'ellipsis',
  verticalPosition: 'center',
  textColor: '#ffffff',
  secondaryColor: '#d6e0ff',
  backgroundOpacity: 0,
  width: 960,
  height: 120,
  x: null,
  y: null,
  styleTemplates: Object.freeze([]),
});

export const BUILTIN_DESKTOP_LYRICS_STYLE_TEMPLATES = Object.freeze([
  {
    id: 'classic',
    style: {
      showSecondary: true,
      fontSize: 32,
      secondaryFontSize: 18,
      textAlign: 'center',
      overflowMode: 'ellipsis',
      verticalPosition: 'center',
      textColor: '#ffffff',
      secondaryColor: '#d6e0ff',
      backgroundOpacity: 0,
    },
  },
  {
    id: 'karaoke',
    style: {
      showSecondary: true,
      fontSize: 42,
      secondaryFontSize: 20,
      textAlign: 'center',
      overflowMode: 'wrap',
      verticalPosition: 'center',
      textColor: '#ffe66d',
      secondaryColor: '#ffffff',
      backgroundOpacity: 0.2,
    },
  },
  {
    id: 'subtitle',
    style: {
      showSecondary: true,
      fontSize: 28,
      secondaryFontSize: 16,
      textAlign: 'center',
      overflowMode: 'wrap',
      verticalPosition: 'bottom',
      textColor: '#ffffff',
      secondaryColor: '#eeeeee',
      backgroundOpacity: 0.4,
    },
  },
  {
    id: 'minimal',
    style: {
      showSecondary: false,
      fontSize: 36,
      secondaryFontSize: 16,
      textAlign: 'left',
      overflowMode: 'wrap',
      verticalPosition: 'top',
      textColor: '#ffffff',
      secondaryColor: '#d6e0ff',
      backgroundOpacity: 0,
    },
  },
]);

const ALIGNMENTS = new Set(['left', 'center', 'right']);
const OVERFLOW_MODES = new Set(['ellipsis', 'wrap']);
const VERTICAL_POSITIONS = new Set(['top', 'center', 'bottom']);
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const TEMPLATE_ID_PATTERN = /^[a-z0-9_-]{1,64}$/i;
const MAX_CUSTOM_STYLE_TEMPLATES = 20;

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

function normalizeStyle(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const defaults = DEFAULT_DESKTOP_LYRICS_SETTINGS;
  return {
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
    verticalPosition: VERTICAL_POSITIONS.has(source.verticalPosition)
      ? source.verticalPosition
      : defaults.verticalPosition,
    textColor: color(source.textColor, defaults.textColor),
    secondaryColor: color(source.secondaryColor, defaults.secondaryColor),
    backgroundOpacity: clamp(
      source.backgroundOpacity,
      0,
      1,
      defaults.backgroundOpacity
    ),
  };
}

function normalizeStyleTemplates(value) {
  if (!Array.isArray(value)) return [];
  const ids = new Set();
  const templates = [];
  for (const candidate of value) {
    if (templates.length >= MAX_CUSTOM_STYLE_TEMPLATES) break;
    const id =
      typeof candidate?.id === 'string'
        ? candidate.id.trim().toLowerCase()
        : '';
    const name =
      typeof candidate?.name === 'string'
        ? candidate.name.trim().slice(0, 40)
        : '';
    if (!TEMPLATE_ID_PATTERN.test(id) || !name || ids.has(id)) continue;
    ids.add(id);
    templates.push({
      id,
      name,
      style: normalizeStyle(candidate.style),
    });
  }
  return templates;
}

export function getDesktopLyricsStyle(value) {
  return normalizeStyle(value);
}

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
    ...normalizeStyle(source),
    width: Math.round(clamp(source.width, 360, 1920, defaults.width)),
    height: Math.round(clamp(source.height, 92, 400, defaults.height)),
    x: coordinate(source.x),
    y: coordinate(source.y),
    styleTemplates: normalizeStyleTemplates(source.styleTemplates),
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

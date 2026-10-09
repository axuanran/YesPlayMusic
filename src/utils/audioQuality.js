// Unified audio-quality model shared by the player bar and the cast panel.
//
// Two consumers speak different vocabularies:
//
//   * local playback — NetEase's seven tiers, persisted as
//     `settings.musicQuality` (see `views/settings.vue`).
//   * ncm-cast push  — the daemon only understands four
//     (standard / exhigh / lossless / hires; see `engine/src/model.rs`,
//     `enum Quality`). Anything richer is downgraded to lossless.
//
// The player-bar control edits the LOCAL value and derives the cast level from
// it, so there is a single quality button that drives both paths.

export const QUALITY_OPTIONS = [
  { value: 'standard', label: '标准', hint: '128kbps' },
  { value: 'exhigh', label: '极高', hint: '320kbps' },
  { value: 'lossless', label: '无损', hint: 'FLAC' },
  { value: 'hires', label: 'Hi-Res', hint: '高解析度' },
  { value: 'jyeffect', label: '沉浸声', hint: '投屏降为无损' },
  { value: 'sky', label: '全景声', hint: '投屏降为无损' },
  { value: 'jymaster', label: '母带', hint: '投屏降为无损' },
];

const LOCAL_VALUES = QUALITY_OPTIONS.map(o => o.value);
const CAST_VALUES = ['standard', 'exhigh', 'lossless', 'hires'];

/**
 * Fold legacy / numeric quality values onto one of the seven tiers.
 * Mirrors the normaliser in `views/settings.vue` so both stay in agreement.
 */
export function normalizeQuality(value) {
  if (typeof value === 'string') {
    if (LOCAL_VALUES.includes(value)) return value;
    if (value === 'flac') return 'lossless';
    if (value === 'higher') return 'exhigh';
  }
  if (value === 999000) return 'jymaster';
  if (value === 350000) return 'lossless';
  if (value === 320000) return 'exhigh';
  if (value === 192000 || value === 128000) return 'standard';
  return 'exhigh';
}

/** The tier the cast daemon should be asked for. */
export function castLevelFor(value) {
  const q = normalizeQuality(value);
  return CAST_VALUES.includes(q) ? q : 'lossless';
}

/** Option record for a (possibly legacy) quality value. */
export function qualityOption(value) {
  const q = normalizeQuality(value);
  return QUALITY_OPTIONS.find(o => o.value === q) || QUALITY_OPTIONS[1];
}

export const qualityLabel = value => qualityOption(value).label;

/** Short label for a cast-daemon tier, for the cast panel. */
const CAST_LABELS = {
  standard: '标准',
  exhigh: '极高',
  lossless: '无损',
  hires: 'Hi-Res',
};
export const castQualityLabel = level => CAST_LABELS[level] || level || '无损';

/** True when the chosen local tier has to be downgraded for casting. */
export const isDowngradedForCast = value =>
  castLevelFor(value) !== normalizeQuality(value);

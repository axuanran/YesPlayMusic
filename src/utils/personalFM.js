// Values accepted by the NetEase /personal/fm/mode endpoint.
export const PERSONAL_FM_MODES = [
  'DEFAULT',
  'FAMILIAR',
  'EXPLORE',
  'SCENE_RCMD',
];

export const PERSONAL_FM_SCENES = [
  'EXERCISE',
  'FOCUS',
  'NIGHT_EMO',
  'SLEEP_HELP',
  'RELAX',
  'CHEERFUL',
  'LYRICAL',
  'CURE',
  'SWEET',
  'RHYTHM_BLUES',
  'RAINY',
  'GAMES',
  'RAP',
  'K_POP',
  'ORIGINAL_MUSICIAL',
  'ELECTRONIC',
  'COMMUTE',
  'TAKE_SHOWER',
  'COFFEE_SHOP',
  'ROCK',
  'INSPIRATIONAL',
  'CHINESE',
  'ENGLISH',
  'YUEYU',
  'MANYAO',
  'JINGDIAN',
  'LIGHT',
  'GUOFENG',
  'FOLK',
  'ACG',
  'GUDIAN',
  'JAZZ',
  'JAPANESE',
  'GLOBAL',
  'FRANCH',
  'BLUE',
  'DANCE',
  'LATIN',
  'PUNK',
  'COUNTRY',
  'MUSICAL',
  'YINGSHI',
];

export function normalizePersonalFMOptions(mode, submode) {
  return {
    mode: PERSONAL_FM_MODES.includes(mode) ? mode : 'DEFAULT',
    submode: PERSONAL_FM_SCENES.includes(submode) ? submode : 'EXERCISE',
  };
}

export function normalizePersonalFMTracks(result, excludedIds = []) {
  const seen = new Set(excludedIds.map(String));
  if (result?.code !== undefined && result.code !== 200) return [];
  if (!Array.isArray(result?.data)) return [];
  return result.data
    .filter(track => {
      if (!track?.id || seen.has(String(track.id))) return false;
      seen.add(String(track.id));
      return true;
    })
    .map(track => ({
      ...track,
      album: track.album || track.al || {},
      artists: track.artists || track.ar || [],
    }));
}

const STORAGE_KEY = 'clientPlaybackHistory';
const MAX_TRACKS = 200;
const MAX_PLAYLISTS = 50;

const emptyHistory = () => ({
  tracks: [],
  playlists: [],
});

const isPositiveID = value =>
  Number.isFinite(Number(value)) && Number(value) > 0;

export function normalizeClientPlaybackHistory(value) {
  return {
    tracks: Array.isArray(value?.tracks)
      ? value.tracks
          .filter(track => isPositiveID(track?.id))
          .slice(0, MAX_TRACKS)
      : [],
    playlists: Array.isArray(value?.playlists)
      ? value.playlists
          .filter(playlist => isPositiveID(playlist?.id))
          .slice(0, MAX_PLAYLISTS)
      : [],
  };
}

export function loadClientPlaybackHistory(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY));
    return normalizeClientPlaybackHistory(value);
  } catch {
    return emptyHistory();
  }
}

export function saveClientPlaybackHistory(history, storage = localStorage) {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeClientPlaybackHistory(history))
    );
    return true;
  } catch {
    return false;
  }
}

const compactTrack = (track, playedAt, playCount) => {
  const artists = Array.isArray(track.ar) ? track.ar : track.artists || [];
  return {
    id: Number(track.id),
    name: track.name || '',
    ar: artists.length > 0 ? artists : [{ id: 0, name: '' }],
    al: track.al || track.album || { id: 0, name: '', picUrl: '' },
    alia: Array.isArray(track.alia) ? track.alia : track.alias || [],
    dt: track.dt || track.duration || 0,
    privilege: track.privilege,
    playable: track.playable ?? true,
    playedAt,
    playCount,
  };
};

const compactPlaylist = (source, playedAt, playCount) => ({
  id: Number(source.id),
  name: source.name || '',
  coverImgUrl: source.coverImgUrl || source.picUrl || '',
  playedAt,
  playCount,
});

const upsertRecent = (items, id, createItem, limit) => {
  const previous = items.find(item => Number(item.id) === Number(id));
  return [
    createItem((previous?.playCount || 0) + 1),
    ...items.filter(item => Number(item.id) !== Number(id)),
  ].slice(0, limit);
};

export function recordClientPlayback(
  history,
  { track, source, recordSource = false, playedAt = Date.now() }
) {
  const next = normalizeClientPlaybackHistory(history);
  if (isPositiveID(track?.id)) {
    next.tracks = upsertRecent(
      next.tracks,
      track.id,
      playCount => compactTrack(track, playedAt, playCount),
      MAX_TRACKS
    );
  }
  if (recordSource && source?.type === 'playlist' && isPositiveID(source.id)) {
    next.playlists = upsertRecent(
      next.playlists,
      source.id,
      playCount => compactPlaylist(source, playedAt, playCount),
      MAX_PLAYLISTS
    );
  }
  return next;
}

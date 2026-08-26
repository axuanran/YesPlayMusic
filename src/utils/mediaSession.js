import {
  createSizedCoverUrl,
  resolveCoverImageUrl,
} from './coverImageUrl';

const ARTWORK_SIZES = [96, 128, 192, 256, 384, 512];

const normalizeArtists = track => {
  const artists =
    Array.isArray(track?.ar) && track.ar.length > 0
      ? track.ar
      : track?.artists || [];
  return Array.isArray(artists)
    ? artists.map(artist => artist?.name).filter(Boolean)
    : [];
};

const normalizeAlbum = track => {
  const album = track?.al || {};
  const fallback = track?.album || {};
  return {
    ...fallback,
    ...album,
    name: album.name || fallback.name || '',
    picUrl: album.picUrl || fallback.picUrl || '',
  };
};

export function getMediaSessionDuration(track) {
  const durationMs = Number(track?.dt ?? track?.duration);
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 0;
}

export function createMediaSessionMetadata(track) {
  const album = normalizeAlbum(track);
  const artworkUrl = resolveCoverImageUrl(track);
  return {
    title: track?.name || '',
    artist: normalizeArtists(track).join(', '),
    album: album.name || '',
    artwork: artworkUrl
      ? ARTWORK_SIZES.map(size => ({
          src: createSizedCoverUrl(artworkUrl, size),
          sizes: `${size}x${size}`,
          type: 'image/jpeg',
        }))
      : [],
  };
}

export function createMediaSessionPositionState({
  duration,
  playbackRate,
  position,
}) {
  const safeDuration = Number(duration);
  if (!Number.isFinite(safeDuration) || safeDuration <= 0) return null;

  const safeRate = Number(playbackRate);
  const safePosition = Number(position);
  return {
    duration: safeDuration,
    playbackRate: Number.isFinite(safeRate) && safeRate > 0 ? safeRate : 1,
    position: Math.min(
      safeDuration,
      Math.max(0, Number.isFinite(safePosition) ? safePosition : 0)
    ),
  };
}

export const TRACK_DOWNLOAD_QUALITIES = [
  { value: 'standard', extension: 'mp3' },
  { value: 'exhigh', extension: 'mp3' },
  { value: 'lossless', extension: 'flac' },
  { value: 'hires', extension: 'flac' },
  { value: 'jyeffect', extension: 'flac' },
  { value: 'sky', extension: 'flac' },
  { value: 'jymaster', extension: 'flac' },
];

const QUALITY_VALUES = new Set(
  TRACK_DOWNLOAD_QUALITIES.map(item => item.value)
);

export function normalizeTrackDownloadQuality(quality) {
  return QUALITY_VALUES.has(quality) ? quality : 'exhigh';
}

export function sanitizeTrackDownloadName(value) {
  const normalized = String(value || '')
    .replace(/\p{Cc}/gu, '_')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim();
  return (normalized || 'track').slice(0, 180);
}

export function createTrackDownloadFilename(track, quality) {
  const normalizedQuality = normalizeTrackDownloadQuality(quality);
  const qualityConfig = TRACK_DOWNLOAD_QUALITIES.find(
    item => item.value === normalizedQuality
  );
  const artists = (track?.ar || [])
    .map(artist => artist?.name)
    .filter(Boolean)
    .join(', ');
  const baseName = [artists, track?.name].filter(Boolean).join(' - ');
  return `${sanitizeTrackDownloadName(baseName)}.${qualityConfig.extension}`;
}

const positiveInteger = value => {
  const number = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(number) && number > 0 ? number : undefined;
};

export function createTrackDownloadMetadata(track, lyricResult) {
  const artists = (track?.ar || track?.artists || [])
    .map(artist => artist?.name)
    .filter(Boolean);
  const album = track?.al || track?.album || {};
  const albumArtist =
    album.artist?.name ||
    album.artists
      ?.map(artist => artist?.name)
      .filter(Boolean)
      .join(', ') ||
    artists[0] ||
    '';
  const publishTime = Number(track?.publishTime || album.publishTime);
  const publishingDate =
    Number.isFinite(publishTime) && publishTime > 0
      ? new Date(publishTime).toISOString().slice(0, 10)
      : '';

  return {
    album: album.name || '',
    albumArtist,
    artist: artists.join(', '),
    coverUrl: album.picUrl || track?.coverUrl || '',
    discNumber: positiveInteger(track?.cd),
    lyrics: lyricResult?.lrc?.lyric || '',
    publishingDate,
    title: track?.name || '',
    trackNumber: positiveInteger(track?.no),
    translatedLyrics: lyricResult?.tlyric?.lyric || '',
  };
}

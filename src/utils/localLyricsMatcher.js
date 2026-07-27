const normalize = value =>
  typeof value === 'string'
    ? value
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/\b(feat|ft)\.?\b.*$/i, '')
        .replace(/[^\p{L}\p{N}]+/gu, '')
    : '';

const bigrams = value => {
  if (value.length < 2) return new Set(value ? [value] : []);
  const result = new Set();
  for (let index = 0; index < value.length - 1; index += 1) {
    result.add(value.slice(index, index + 2));
  }
  return result;
};

export function textSimilarity(left, right) {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return (
      Math.min(normalizedLeft.length, normalizedRight.length) /
      Math.max(normalizedLeft.length, normalizedRight.length)
    );
  }
  const leftPairs = bigrams(normalizedLeft);
  const rightPairs = bigrams(normalizedRight);
  let overlap = 0;
  for (const pair of leftPairs) {
    if (rightPairs.has(pair)) overlap += 1;
  }
  return (2 * overlap) / (leftPairs.size + rightPairs.size || 1);
}

const artistNames = track => {
  const artists = Array.isArray(track?.ar)
    ? track.ar
    : Array.isArray(track?.artists)
      ? track.artists
      : [];
  if (artists.length) {
    return artists
      .flatMap(artist =>
        typeof artist?.name === 'string' ? artist.name.split(/[,/&、，]/) : []
      )
      .filter(Boolean);
  }
  if (typeof track?.artist === 'string') {
    return track.artist.split(/[,/&、，]/).filter(Boolean);
  }
  return [];
};

const artistSimilarity = (localTrack, candidate) => {
  const localArtists = artistNames(localTrack);
  const candidateArtists = artistNames(candidate);
  let best = 0;
  for (const localArtist of localArtists) {
    for (const candidateArtist of candidateArtists) {
      best = Math.max(best, textSimilarity(localArtist, candidateArtist));
    }
  }
  return best;
};

const durationSimilarity = (left, right) => {
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    left <= 0 ||
    right <= 0
  ) {
    return 0;
  }
  const difference = Math.abs(left - right);
  if (difference <= 2000) return 1;
  if (difference <= 5000) return 0.8;
  if (difference <= 10000) return 0.5;
  if (difference <= 20000) return 0.2;
  return 0;
};

export function scoreLocalLyricMatch(localTrack, candidate) {
  const title = textSimilarity(localTrack?.name, candidate?.name);
  const artist = artistSimilarity(localTrack, candidate);
  const duration = durationSimilarity(
    Number(localTrack?.dt || localTrack?.duration),
    Number(candidate?.dt || candidate?.duration)
  );
  return title * 0.65 + artist * 0.2 + duration * 0.15;
}

export function rankLocalLyricMatches(
  localTrack,
  candidates,
  minimumScore = 0.62
) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map(track => ({ score: scoreLocalLyricMatch(localTrack, track), track }))
    .filter(match => match.score >= minimumScore)
    .sort((left, right) => right.score - left.score);
}

export function createLocalLyricSearchKeywords(track) {
  return [track?.name, ...artistNames(track)]
    .filter(value => typeof value === 'string' && value.trim())
    .join(' ')
    .trim();
}

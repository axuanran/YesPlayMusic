export function mapCachedTrackDetails(tracks) {
  if (tracks.some(track => track === undefined)) return undefined;
  return {
    songs: tracks.map(track => track.detail),
    privileges: tracks.map(track => track.privileges),
  };
}

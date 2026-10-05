export function collectQueueTrackIds(
  list,
  currentIndex,
  playNextList,
  limit = 100
) {
  return [
    ...list.slice(currentIndex + 1, currentIndex + 1 + limit),
    ...playNextList,
  ];
}

export function getMissingTrackIds(trackIds, loadedTracks) {
  const loadedIds = new Set(loadedTracks.map(track => track.id));
  return [...new Set(trackIds.filter(id => !loadedIds.has(id)))];
}

export function retainQueueTracks(existingTracks, loadedTracks, trackIds) {
  const desiredIds = new Set(trackIds);
  const tracksById = new Map();
  for (const track of existingTracks) tracksById.set(track.id, track);
  for (const track of loadedTracks) tracksById.set(track.id, track);
  return [...desiredIds]
    .map(id => tracksById.get(id))
    .filter(track => track !== undefined);
}

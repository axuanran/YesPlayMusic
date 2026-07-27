export function getWritableUserPlaylists(
  playlists,
  userId,
  likedSongPlaylistId
) {
  if (!Array.isArray(playlists) || userId === null || userId === undefined) {
    return [];
  }
  const normalizedUserId = String(userId);
  const normalizedLikedId = String(likedSongPlaylistId ?? '');
  return playlists.filter(playlist => {
    const creatorId = playlist?.creator?.userId;
    if (creatorId === null || creatorId === undefined) return false;
    return (
      String(creatorId) === normalizedUserId &&
      String(playlist.id) !== normalizedLikedId
    );
  });
}

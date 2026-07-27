const text = (value, maxLength = 512) =>
  typeof value === 'string' ? value.slice(0, maxLength) : '';

export function createDiscordPresenceTrack(track) {
  const source = track && typeof track === 'object' ? track : {};
  const album =
    source.al && typeof source.al === 'object' && !Array.isArray(source.al)
      ? source.al
      : {};
  const artists = Array.isArray(source.ar) ? source.ar : [];

  return {
    name: text(source.name),
    dt:
      typeof source.dt === 'number' && Number.isFinite(source.dt)
        ? Math.max(0, source.dt)
        : 0,
    ar: artists.slice(0, 20).map(artist => ({
      name: text(artist?.name, 256),
    })),
    al: {
      name: text(album.name),
      picUrl: text(album.picUrl, 2048),
    },
  };
}

const fallbackArtist = radio => [
  {
    id: 0,
    name: radio?.dj?.nickname || radio?.name || '',
  },
];

export function normalizePodcastProgram(program, radio = {}) {
  const song = program?.mainSong;
  const songId = Number(song?.id);
  if (!Number.isFinite(songId) || songId <= 0) return null;

  const coverUrl = program.coverUrl || radio.picUrl || '';
  const songArtists = song.ar || song.artists;
  const artists =
    Array.isArray(songArtists) && songArtists.length > 0
      ? songArtists
      : fallbackArtist(radio);
  const sourceAlbum = song.al || song.album || {};

  return {
    ...song,
    id: songId,
    name: program.name || song.name || '',
    dt: song.dt || program.duration || 0,
    ar: artists,
    alia: Array.isArray(song.alia)
      ? song.alia
      : Array.isArray(song.alias)
        ? song.alias
        : [],
    al: {
      ...sourceAlbum,
      id: sourceAlbum.id || 0,
      name: sourceAlbum.name || radio.name || '',
      picUrl: sourceAlbum.picUrl || coverUrl,
    },
    playable: true,
    podcast: {
      programId: program.id,
      radioId: radio.id,
      serialNumber: program.serialNum,
    },
  };
}

export function normalizePodcastPrograms(programs, radio = {}) {
  if (!Array.isArray(programs)) return [];
  return programs
    .map(program => normalizePodcastProgram(program, radio))
    .filter(Boolean);
}

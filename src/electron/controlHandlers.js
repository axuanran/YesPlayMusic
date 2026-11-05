import { handleMprisCommand } from './ipcRenderer';
import { PERSONAL_FM_MODES, PERSONAL_FM_SCENES } from '@/utils/personalFM';

// Renderer side of the local control channel (docs/control-api.md). Everything
// here runs inside the Vue app, so it can use the player/store and the app's
// own API layer directly.

const CONTROL_TYPES = new Set([
  'play',
  'pause',
  'playPause',
  'stop',
  'next',
  'previous',
  'seek',
  'setPosition',
  'setLoopStatus',
  'setShuffle',
  'setVolume',
  'setRate',
  'queueMove',
  'queueClear',
]);

const SEARCH_TYPES = { song: 1, album: 10, artist: 100, playlist: 1000 };

// The preload sanitizer drops arrays longer than 256 entries, so every list
// that leaves the renderer goes through this page size.
const MAX_PAGE = 256;
const DEFAULT_PAGE = 100;
const MAX_SEARCH_LIMIT = 50;
const MAX_RESULT_BYTES = 98304;

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const toId = (value, name) => {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(number) || number <= 0) {
    fail('invalid_params', `${name} must be a positive integer id`);
  }
  return number;
};

const toPage = (
  params = {},
  { max = MAX_PAGE, fallback = DEFAULT_PAGE } = {}
) => {
  const limit = params.limit === undefined ? fallback : Number(params.limit);
  const offset = params.offset === undefined ? 0 : Number(params.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > max) {
    fail('invalid_params', `limit must be an integer between 1 and ${max}`);
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    fail('invalid_params', 'offset must be a non-negative integer');
  }
  return { limit, offset };
};

const pageOf = (items, { limit, offset }) => {
  const list = Array.isArray(items) ? items : [];
  const window = list.slice(offset, offset + limit);
  const nextOffset = offset + window.length;
  return {
    items: window,
    total: list.length,
    offset,
    limit,
    nextOffset: nextOffset < list.length ? nextOffset : null,
  };
};

const assertParams = (params, allowed, method) => {
  if (params === undefined || params === null) return {};
  if (typeof params !== 'object' || Array.isArray(params)) {
    fail('invalid_params', `${method} expects an object of parameters`);
  }
  for (const key of Object.keys(params)) {
    if (!allowed.includes(key)) {
      fail('invalid_params', `${method} does not accept "${key}"`);
    }
  }
  return params;
};

const artistsOf = track =>
  Array.isArray(track?.ar)
    ? track.ar.map(artist => artist.name).filter(Boolean)
    : Array.isArray(track?.artists)
      ? track.artists.map(artist => artist.name).filter(Boolean)
      : [];

const trackBrief = track => {
  if (!track || !track.id) return null;
  return {
    id: track.id,
    name: track.name || '',
    artists: artistsOf(track),
    album: track.al?.name || track.album?.name || '',
    durationMs: track.dt ?? track.duration ?? null,
  };
};

const trackFromApi = track => {
  if (!track || !track.id) return null;
  return {
    id: track.id,
    name: track.name || '',
    artists: artistsOf(track).join(', '),
    album: track.al?.name || '',
    durationMs: track.dt ?? track.duration ?? null,
  };
};

export function createControlHandlers({ store, player }) {
  // Playback mutations are serialized and last-wins: a playlist fetch that was
  // started first must not overwrite a later "play this track" request.
  let mutationToken = 0;
  let mutationChain = Promise.resolve();
  const serialize = run => {
    const token = ++mutationToken;
    const result = mutationChain.then(() =>
      token === mutationToken ? run() : { accepted: false, superseded: true }
    );
    mutationChain = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  const status = () => {
    const currentTrack = trackBrief(player.currentTrack);
    const likedSongs = store.state.liked?.songs;
    return {
      playing: !!player.playing,
      positionMs: Math.round((player.progress || 0) * 1000),
      volume: player.volume,
      repeatMode: player.repeatMode,
      shuffle: !!player.shuffle,
      isPersonalFM: !!player.isPersonalFM,
      roaming: roamingStatus(),
      currentTrack,
      source: player.playlistSource ?? null,
      queue: {
        playlistTotal: Array.isArray(player.list) ? player.list.length : 0,
        priorityTotal: Array.isArray(player.playNextList)
          ? player.playNextList.length
          : 0,
      },
      liked:
        currentTrack && Array.isArray(likedSongs)
          ? likedSongs.includes(currentTrack.id)
          : undefined,
    };
  };

  const roamingStatus = () => ({
    active: !!player.isPersonalFM,
    mode: player.personalFMMode,
    scene:
      player.personalFMMode === 'SCENE_RCMD' ? player.personalFMSubmode : null,
    loading: !!player.personalFMLoading,
    error: !!player.personalFMError,
    track: trackBrief(player.personalFMTrack),
  });

  const roaming = params => {
    const body = assertParams(params, ['action', 'mode', 'scene'], 'roaming');
    const { action, mode, scene } = body;
    if (!['status', 'options', 'play', 'set_mode', 'next'].includes(action)) {
      fail('invalid_params', `unsupported roaming action "${action}"`);
    }
    const selectsMode = action === 'play' || action === 'set_mode';
    if (!selectsMode && (mode !== undefined || scene !== undefined)) {
      fail('invalid_params', `${action} does not accept mode or scene`);
    }
    if (action === 'set_mode' && mode === undefined) {
      fail('invalid_params', 'set_mode requires a mode');
    }
    if (mode !== undefined && !PERSONAL_FM_MODES.includes(mode)) {
      fail(
        'invalid_params',
        `mode must be one of ${PERSONAL_FM_MODES.join(', ')}`
      );
    }
    if (mode === 'SCENE_RCMD' && !PERSONAL_FM_SCENES.includes(scene)) {
      fail(
        'invalid_params',
        'SCENE_RCMD requires a supported scene from roaming options'
      );
    }
    if (scene !== undefined && mode !== 'SCENE_RCMD') {
      fail('invalid_params', 'scene is only accepted with mode=SCENE_RCMD');
    }
    if (action === 'status') return roamingStatus();
    if (action === 'options') {
      return { modes: [...PERSONAL_FM_MODES], scenes: [...PERSONAL_FM_SCENES] };
    }
    return serialize(async () => {
      if (player.personalFMLoading)
        fail('busy', 'Personal roaming is loading; retry shortly');
      if (
        mode !== undefined &&
        !(await player.setPersonalFMMode(mode, scene))
      ) {
        fail('api_error', 'Could not load the requested roaming mode');
      }
      if (
        action === 'play' &&
        !(await player.playPersonalFM({ toggle: false }))
      ) {
        fail('api_error', 'Could not start personal roaming');
      }
      if (action === 'next') {
        if (!player.isPersonalFM)
          fail(
            'not_roaming',
            'Start personal roaming before skipping a roaming track'
          );
        if (!(await player.playNextFMTrack()))
          fail('api_error', 'Could not load the next roaming track');
      }
      return { accepted: true, ...roamingStatus() };
    });
  };

  // Separate method so the main process can enforce the existing account-write gate.
  const roamingDislike = params => {
    assertParams(params, [], 'roamingDislike');
    return serialize(async () => {
      if (!player.isPersonalFM)
        fail(
          'not_roaming',
          'Start personal roaming before disliking a roaming track'
        );
      if (player.personalFMLoading)
        fail('busy', 'Personal roaming is loading; retry shortly');
      try {
        if (!(await player.moveToFMTrash({ throwOnError: true }))) {
          fail(
            'api_error',
            'Could not skip and dislike the current roaming track'
          );
        }
      } catch (error) {
        fail('api_error', error.message || 'Could not submit roaming feedback');
      }
      return { accepted: true, ...roamingStatus() };
    });
  };

  const control = params => {
    const { type, ...rest } = assertParams(
      params,
      [
        'type',
        'offset',
        'position',
        'mode',
        'enabled',
        'volume',
        'rate',
        'queue',
        'from',
        'to',
      ],
      'control'
    );
    if (!CONTROL_TYPES.has(type)) {
      fail('invalid_params', `unsupported control type "${type}"`);
    }
    if (type === 'setVolume' && !(rest.volume >= 0 && rest.volume <= 1)) {
      fail('invalid_params', 'volume must be between 0 and 1');
    }
    if (type === 'setPosition' && !(rest.position >= 0)) {
      fail('invalid_params', 'position must be >= 0 seconds');
    }
    if (type === 'seek' && !Number.isFinite(rest.offset)) {
      fail('invalid_params', 'offset must be a number of seconds');
    }
    if (type === 'setLoopStatus' && !['off', 'on', 'one'].includes(rest.mode)) {
      fail('invalid_params', 'mode must be off, on or one');
    }
    if (type === 'setShuffle' && typeof rest.enabled !== 'boolean') {
      fail('invalid_params', 'enabled must be a boolean');
    }
    if (type === 'queueMove') {
      if (
        rest.queue !== 'priority' ||
        !Number.isInteger(rest.from) ||
        rest.from < 0 ||
        !Number.isInteger(rest.to) ||
        rest.to < 0
      ) {
        fail(
          'invalid_params',
          'queueMove expects queue="priority" with non-negative integer from/to'
        );
      }
    }
    if (
      type === 'queueClear' &&
      !['priority', 'upcoming'].includes(rest.queue)
    ) {
      fail(
        'invalid_params',
        'queueClear expects queue="priority" or "upcoming"'
      );
    }
    if (type === 'setRate' && !(rest.rate > 0)) {
      fail('invalid_params', 'rate must be > 0');
    }
    handleMprisCommand(player, { type, ...rest });
    return { accepted: true, type };
  };

  const play = params =>
    serialize(() => {
      const body = assertParams(
        params,
        ['id', 'trackId', 'playlistId', 'albumId', 'artistId'],
        'play'
      );
      const targets = [
        'id',
        'trackId',
        'playlistId',
        'albumId',
        'artistId',
      ].filter(key => body[key] !== undefined);
      if (targets.length !== 1) {
        fail(
          'invalid_params',
          'play accepts exactly one of id, playlistId, albumId, artistId'
        );
      }
      if (body.playlistId !== undefined) {
        const id = toId(body.playlistId, 'playlistId');
        player.playPlaylistByID(id);
        return { accepted: true, target: { type: 'playlist', id } };
      }
      if (body.albumId !== undefined) {
        const id = toId(body.albumId, 'albumId');
        player.playAlbumByID(id);
        return { accepted: true, target: { type: 'album', id } };
      }
      if (body.artistId !== undefined) {
        const id = toId(body.artistId, 'artistId');
        player.playArtistByID(id);
        return { accepted: true, target: { type: 'artist', id } };
      }
      const id = toId(body.id ?? body.trackId, 'id');
      const list = Array.isArray(player.list) ? player.list : [];
      if (!player.isPersonalFM && list.includes(id)) {
        // keep the current queue and just jump to the track
        player.playTrackOnListByID(id);
      } else {
        // a track from outside the queue: play it on its own. Source id 0 is the
        // player's "no list source" sentinel, so no dead source link is rendered.
        player.replacePlaylist([id], 0, 'single', id);
      }
      return { accepted: true, target: { type: 'track', id } };
    });

  const enqueue = params =>
    serialize(() => {
      const body = assertParams(params, ['id', 'trackId', 'ids'], 'enqueue');
      const ids = (
        body.ids !== undefined ? body.ids : [body.id ?? body.trackId]
      )
        .filter(value => value !== undefined)
        .map((value, index) => toId(value, `ids[${index}]`));
      if (ids.length === 0) fail('invalid_params', 'enqueue needs id or ids');
      if (ids.length > MAX_PAGE) {
        fail('invalid_params', `enqueue accepts at most ${MAX_PAGE} ids`);
      }
      for (const id of ids) player.addTrackToPlayNext(id);
      // the queue has a single insertion point: the priority FIFO that plays
      // before the rest of the playlist
      return { accepted: true, queued: ids, position: 'priority' };
    });

  const queue = params => {
    const body = assertParams(params, ['offset', 'limit'], 'queue');
    const { limit, offset } = toPage(body);
    return {
      playlist: pageOf(player.list, { limit, offset }),
      priority: pageOf(player.playNextList, { limit, offset }),
      currentIndex: Number.isInteger(player.current) ? player.current : null,
      shuffle: !!player.shuffle,
      repeatMode: player.repeatMode,
      source: player.playlistSource ?? null,
    };
  };

  const searchCatalog = async params => {
    const body = assertParams(
      params,
      ['keywords', 'type', 'limit', 'offset'],
      'search'
    );
    const { keywords, type = 'song' } = body;
    if (
      typeof keywords !== 'string' ||
      keywords.trim() === '' ||
      keywords.length > 128
    ) {
      fail(
        'invalid_params',
        'keywords must be a non-empty string (max 128 chars)'
      );
    }
    const searchType = SEARCH_TYPES[type];
    if (!searchType) {
      fail(
        'invalid_params',
        `type must be one of ${Object.keys(SEARCH_TYPES).join(', ')}`
      );
    }
    const { limit, offset } = toPage(body, {
      max: MAX_SEARCH_LIMIT,
      fallback: 10,
    });
    // imported lazily: the API layer pulls in the authenticated request stack
    const { search } = await import('@/api/others');
    const result = await search({ keywords, type: searchType, limit, offset });
    const payload = result.result || {};
    const map = {
      album: album => ({
        id: album.id,
        name: album.name,
        artists: (album.artists || album.ar || [])
          .map(artist => artist.name)
          .filter(Boolean)
          .join(', '),
        size: album.size,
      }),
      artist: artist => ({
        id: artist.id,
        name: artist.name,
        alias: artist.alias || [],
      }),
      playlist: playlist => ({
        id: playlist.id,
        name: playlist.name,
        trackCount: playlist.trackCount,
        creator: playlist.creator?.nickname || '',
      }),
      song: trackFromApi,
    }[type];
    const source = {
      song: payload.songs,
      album: payload.albums,
      artist: payload.artists,
      playlist: payload.playlists,
    }[type];
    const items = (source || []).map(map).filter(Boolean);
    return { type, ...pageOf(items, { limit, offset }) };
  };

  const lyrics = async params => {
    const body = assertParams(params, ['id', 'offset', 'limit'], 'lyrics');
    const id = toId(body.id, 'id');
    const { limit, offset } = toPage(body);
    const [{ getLyric }, { lyricParser }] = await Promise.all([
      import('@/api/track'),
      import('@/utils/lyrics'),
    ]);
    const parsed = lyricParser(await getLyric(id));
    const translations = new Map(
      (parsed.tlyric || []).map(line => [
        Math.round(line.time * 1000),
        line.content,
      ])
    );
    // lyricParser returns seconds; the API speaks milliseconds
    const lines = parsed.lyric.map(line => {
      const timeMs = Math.round(line.time * 1000);
      return {
        timeMs,
        text: line.content,
        translation: translations.get(timeMs) || undefined,
      };
    });
    return {
      id,
      synced: lines.length > 0,
      ...pageOf(lines, { limit, offset }),
    };
  };

  const recommend = async params => {
    const body = assertParams(params, ['offset', 'limit'], 'recommend');
    const { limit, offset } = toPage(body);
    const { dailyRecommendTracks } = await import('@/api/playlist');
    const result = await dailyRecommendTracks();
    const items = (result.data?.dailySongs || [])
      .map(trackFromApi)
      .filter(Boolean);
    return pageOf(items, { limit, offset });
  };

  // Account writes go through an explicit, awaitable store action so failures
  // are reported instead of being swallowed behind a toast, and are serialized
  // like the other mutations.
  const like = params =>
    serialize(async () => {
      const body = assertParams(params, ['id', 'liked'], 'like');
      const id = toId(body.id, 'id');
      if (typeof body.liked !== 'boolean') {
        fail('invalid_params', 'liked must be true or false');
      }
      const result = await store.dispatch('setTrackLiked', {
        id,
        liked: body.liked,
      });
      return {
        accepted: true,
        id,
        liked: result?.liked ?? body.liked,
        stale: !!result?.stale,
      };
    });

  const handlers = {
    status,
    roaming,
    roamingDislike,
    control,
    play,
    enqueue,
    queue,
    search: searchCatalog,
    lyrics,
    recommend,
    like,
  };

  return handlers;
}

export const CONTROL_MAX_RESULT_BYTES = MAX_RESULT_BYTES;

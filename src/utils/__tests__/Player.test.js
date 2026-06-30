import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  audioHandlers: [],
  audioInstances: [],
  cacheTrackSource: vi.fn(),
  emitPlayerEvent: vi.fn(),
  getMP3: vi.fn(),
  getOuterAudioUrl: vi.fn(trackId => `outer:${trackId}`),
  getTrackSource: vi.fn(),
  isAccountLoggedIn: vi.fn(() => false),
  personalFM: vi.fn(() =>
    Promise.resolve({
      data: [{ id: 1001 }, { id: 1002 }],
    })
  ),
  resolveTrackSource: vi.fn(),
  store: {
    state: {
      lastfm: {},
      liked: {
        songs: [],
      },
      settings: {
        automaticallyCacheSongs: false,
        enableDiscordRichPresence: false,
      },
    },
    commit: vi.fn(),
    dispatch: vi.fn(),
  },
}));

vi.mock('@/api/album', () => ({
  getAlbum: vi.fn(),
}));

vi.mock('@/api/artist', () => ({
  getArtist: vi.fn(),
}));

vi.mock('@/api/lastfm', () => ({
  trackScrobble: vi.fn(),
  trackUpdateNowPlaying: vi.fn(),
}));

vi.mock('@/api/others', () => ({
  fmTrash: vi.fn(),
  personalFM: mocks.personalFM,
}));

vi.mock('@/api/playlist', () => ({
  getPlaylistDetail: vi.fn(),
  intelligencePlaylist: vi.fn(),
}));

vi.mock('@/api/track', () => ({
  getLyric: vi.fn(),
  getMP3: mocks.getMP3,
  getTrackDetail: vi.fn(),
  scrobble: vi.fn(),
}));

vi.mock('@/store', () => ({
  default: mocks.store,
}));

vi.mock('@/utils/AudioEngine', () => ({
  default: vi.fn().mockImplementation(function AudioEngine(handlers) {
    const instance = {
      currentTime: vi.fn(() => 0),
      load: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      playing: vi.fn(() => false),
      seek: vi.fn(),
      setOutputDevice: vi.fn(),
      stop: vi.fn(),
      volume: vi.fn(),
    };
    mocks.audioHandlers.push(handlers);
    mocks.audioInstances.push(instance);
    return instance;
  }),
}));

vi.mock('@/utils/auth', () => ({
  isAccountLoggedIn: mocks.isAccountLoggedIn,
}));

vi.mock('@/utils/db', () => ({
  cacheTrackSource: mocks.cacheTrackSource,
  getTrackSource: mocks.getTrackSource,
}));

vi.mock('@/utils/platform', () => ({
  isCreateTray: false,
}));

vi.mock('@/utils/env', () => ({
  isElectron: false,
}));

vi.mock('lodash/shuffle', () => ({
  default: values => values,
}));

vi.mock('@/utils/resolveAudioSource', () => ({
  getOuterAudioUrl: mocks.getOuterAudioUrl,
  resolveTrackSource: mocks.resolveTrackSource,
}));

vi.mock('@/plugins/playerEvents', () => ({
  emitPlayerEvent: mocks.emitPlayerEvent,
  PLAYER_EVENTS: {
    AUDIO_ERROR: 'audio:error',
    AUDIO_LOADED: 'audio:loaded',
    PLAYBACK_PAUSE: 'playback:pause',
    PLAYBACK_PLAY: 'playback:play',
    TRACK_CHANGE: 'track:change',
  },
}));

function installBrowserGlobals() {
  globalThis.window = {
    electronAPI: undefined,
    MediaMetadata: vi.fn(),
  };
  globalThis.document = {
    title: '',
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {},
  });
  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:test'),
  });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  globalThis.Blob = vi.fn();
  globalThis.requestAnimationFrame = vi.fn();
  globalThis.cancelAnimationFrame = vi.fn();
}

async function createPlayer() {
  installBrowserGlobals();
  vi.resetModules();
  const { default: Player } = await import('../Player');
  return new Player();
}

describe('Player audio source flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.audioHandlers.length = 0;
    mocks.audioInstances.length = 0;
    mocks.resolveTrackSource.mockReset();
    mocks.resolveTrackSource.mockResolvedValue('resolver:1');
    mocks.getTrackSource.mockReset();
    mocks.getTrackSource.mockResolvedValue(null);
    mocks.getMP3.mockReset();
    mocks.getOuterAudioUrl.mockClear();
    mocks.isAccountLoggedIn.mockReturnValue(false);
  });

  it('uses resolver source without touching legacy fallback', async () => {
    const player = await createPlayer();
    const legacy = vi.spyOn(player, '_getAudioSourceLegacy');

    await expect(player._getAudioSource({ id: 1 })).resolves.toBe('resolver:1');

    expect(mocks.resolveTrackSource).toHaveBeenCalledWith({ id: 1 });
    expect(legacy).not.toHaveBeenCalled();
  });

  it('falls back to legacy source when resolver fails', async () => {
    mocks.resolveTrackSource.mockRejectedValue(new Error('resolver down'));
    const player = await createPlayer();
    vi.spyOn(player, '_getAudioSourceLegacy').mockResolvedValue('legacy:1');

    await expect(player._getAudioSource({ id: 1 })).resolves.toBe('legacy:1');

    expect(player._getAudioSourceLegacy).toHaveBeenCalledWith({ id: 1 });
  });

  it('ignores stale audio callbacks after a newer source loads', async () => {
    const player = await createPlayer();
    const nextTrack = vi
      .spyOn(player, '_nextTrackCallback')
      .mockImplementation(() => {});

    player._playAudioSource('first.mp3', false);
    const staleToken = player._audioToken;
    player._playAudioSource('second.mp3', false);

    mocks.audioHandlers[0].onEnded(staleToken);
    expect(nextTrack).not.toHaveBeenCalled();

    mocks.audioHandlers[0].onEnded(player._audioToken);
    expect(nextTrack).toHaveBeenCalledTimes(1);
  });
});

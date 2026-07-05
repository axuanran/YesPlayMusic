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

    await expect(player._resolver.resolveSource({ id: 1 })).resolves.toBe(
      'resolver:1'
    );

    expect(mocks.resolveTrackSource).toHaveBeenCalledWith(
      { id: 1 },
      expect.any(Object)
    );
    expect(mocks.getTrackSource).not.toHaveBeenCalled();
    expect(mocks.getMP3).not.toHaveBeenCalled();
  });

  it('falls back to legacy outer source when resolver fails while logged out', async () => {
    mocks.resolveTrackSource.mockRejectedValue(new Error('resolver down'));
    const player = await createPlayer();

    await expect(player._resolver.resolveSource({ id: 1 })).resolves.toBe(
      'outer:1'
    );

    expect(mocks.getOuterAudioUrl).toHaveBeenCalledWith(1);
  });

  it('does not fall back to outer html when logged-in netease source fails', async () => {
    mocks.resolveTrackSource.mockRejectedValue(new Error('resolver down'));
    mocks.isAccountLoggedIn.mockReturnValue(true);
    mocks.getMP3.mockRejectedValue(new Error('netease down'));
    const player = await createPlayer();

    await expect(player._resolver.resolveSource({ id: 1 })).resolves.toBeNull();

    expect(mocks.getOuterAudioUrl).not.toHaveBeenCalled();
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

  it('re-resolves the current source when playback stalls without an audio error', async () => {
    vi.useFakeTimers();
    const player = await createPlayer();
    player._playing = true;
    player._currentTrack = {
      id: 1,
      name: 'stalled track',
      ar: [{ name: 'artist' }],
      al: { name: 'album' },
      dt: 180000,
    };
    player._currentAudioSource = 'resolver:stale';
    player._progress = 30;
    player._audioToken = 1;
    const replaceAudio = vi
      .spyOn(player, '_replaceCurrentTrackAudio')
      .mockResolvedValue(true);
    const seek = vi.spyOn(player, 'seek').mockImplementation(() => 30);
    const play = vi.spyOn(player, 'play').mockImplementation(() => {});

    mocks.audioHandlers[0].onWaiting(1);
    await vi.advanceTimersByTimeAsync(12000);

    expect(replaceAudio).toHaveBeenCalledWith(
      player.currentTrack,
      true,
      false,
      expect.any(String),
      expect.any(Number),
      undefined,
      { bypassCache: true }
    );
    expect(seek).toHaveBeenCalledWith(30, false);
    expect(play).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

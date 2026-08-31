import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  audioHandlers: [],
  audioInstances: [],
  cacheTrackSource: vi.fn(),
  emitPlayerEvent: vi.fn(),
  getMP3: vi.fn(),
  getOuterAudioUrl: vi.fn(trackId => `outer:${trackId}`),
  getTrackSource: vi.fn(),
  isCapacitor: false,
  isAccountLoggedIn: vi.fn(() => false),
  mediaSession: {
    metadata: null,
    playbackState: 'none',
    setActionHandler: vi.fn(),
    setPositionState: vi.fn(),
  },
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
      cancelFade: vi.fn(),
      currentTime: vi.fn(() => 0),
      fade: vi.fn(() => Promise.resolve()),
      load: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      playbackRate: vi.fn(),
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

vi.mock('@/mobile/AndroidAudioEngine', () => ({
  default: vi.fn().mockImplementation(function AndroidAudioEngine(handlers) {
    const instance = {
      cacheSource: vi.fn(() => Promise.resolve()),
      cancelFade: vi.fn(),
      clearNextSource: vi.fn(() => Promise.resolve()),
      currentTime: vi.fn(() => 0),
      fade: vi.fn(() => Promise.resolve()),
      load: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      playbackRate: vi.fn(),
      playing: vi.fn(() => false),
      queueNextSource: vi.fn(() => Promise.resolve()),
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
  get isCapacitor() {
    return mocks.isCapacitor;
  },
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
  globalThis.yesplaymusicStore = mocks.store;
  globalThis.window = {
    electronAPI: undefined,
    MediaMetadata: vi.fn(),
  };
  globalThis.document = {
    title: '',
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaSession: mocks.mediaSession,
    },
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

let WebPlayerClass;
let AndroidPlayerClass;

function createPlayer() {
  installBrowserGlobals();
  const PlayerClass = mocks.isCapacitor ? AndroidPlayerClass : WebPlayerClass;
  return new PlayerClass();
}

describe('Player audio source flow', () => {
  beforeAll(async () => {
    installBrowserGlobals();
    mocks.isCapacitor = false;
    vi.resetModules();
    WebPlayerClass = (await import('../Player')).default;
    mocks.isCapacitor = true;
    vi.resetModules();
    AndroidPlayerClass = (await import('../Player')).default;
    mocks.isCapacitor = false;
  });

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
    mocks.isCapacitor = false;
    mocks.isAccountLoggedIn.mockReturnValue(false);
    mocks.mediaSession.metadata = null;
    mocks.mediaSession.playbackState = 'none';
    mocks.mediaSession.setActionHandler.mockClear();
    mocks.mediaSession.setPositionState.mockClear();
  });

  it('checks the cache before using resolver source', async () => {
    const player = await createPlayer();

    await expect(player._resolver.resolveSource({ id: 1 })).resolves.toBe(
      'resolver:1'
    );

    expect(mocks.resolveTrackSource).toHaveBeenCalledWith(
      { id: 1 },
      expect.any(Object)
    );
    expect(mocks.getTrackSource).toHaveBeenCalledWith('1');
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

  it('persists playback rate and reapplies it when a source loads', async () => {
    vi.useFakeTimers();
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];

    player.playbackRate = 1.5;
    player._playAudioSource('track.mp3', false);
    await vi.advanceTimersByTimeAsync(150);

    expect(player.playbackRate).toBe(1.5);
    expect(audio.playbackRate).toHaveBeenLastCalledWith(1.5);
    expect(JSON.parse(localStorage.getItem('player'))._playbackRate).toBe(1.5);
    vi.useRealTimers();
  });

  it('publishes complete SMTC metadata and an accurate timeline', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    const track = {
      id: 1,
      name: 'Track',
      artists: [{ name: 'Artist' }],
      album: {
        name: 'Album',
        picUrl: 'cover.jpg',
      },
      duration: 180543,
    };
    player._currentTrack = track;
    player._enabled = true;
    player._playbackRate = 1.25;
    audio.currentTime.mockReturnValue(42.375);

    player._updateMediaSessionMetaData(track);
    player._updateMediaSessionPositionState();

    expect(window.MediaMetadata).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Track',
        artist: 'Artist',
        album: 'Album',
        artwork: expect.arrayContaining([
          expect.objectContaining({
            sizes: '512x512',
            type: 'image/jpeg',
          }),
        ]),
      })
    );
    expect(mocks.mediaSession.setPositionState).toHaveBeenLastCalledWith({
      duration: 180.543,
      playbackRate: 1.25,
      position: 42.375,
    });

    player._setPlaying(true);
    expect(mocks.mediaSession.playbackState).toBe('playing');
    player._setPlaying(false);
    expect(mocks.mediaSession.playbackState).toBe('paused');
  });

  it('registers complete media transport action handlers on a fresh player', async () => {
    await createPlayer();
    const actions = mocks.mediaSession.setActionHandler.mock.calls.map(
      ([action]) => action
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'stop',
        'seekto',
        'seekbackward',
        'seekforward',
      ])
    );
  });

  it('refreshes the SMTC timeline during playback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(6000);
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    player._currentTrack = {
      id: 1,
      name: 'Track',
      ar: [{ name: 'Artist' }],
      al: { name: 'Album' },
      dt: 180543,
    };
    audio.currentTime.mockReturnValue(5.125);
    mocks.mediaSession.setPositionState.mockClear();

    player._syncProgress();

    expect(mocks.mediaSession.setPositionState).toHaveBeenCalledWith({
      duration: 180.543,
      playbackRate: 1,
      position: 5.125,
    });
    vi.useRealTimers();
  });

  it('records a track once per load and a playlist once per queue', async () => {
    const player = await createPlayer();
    player._currentTrack = {
      id: 1,
      name: 'Track 1',
      ar: [{ name: 'Artist' }],
      al: { name: 'Album' },
      dt: 180000,
    };
    player._playlistSource = {
      id: 8,
      type: 'playlist',
      name: 'Playlist',
      coverImgUrl: 'playlist.jpg',
    };

    player.play();
    await vi.waitFor(() => {
      expect(mocks.store.commit).toHaveBeenCalledWith(
        'recordClientPlayback',
        expect.objectContaining({
          recordSource: true,
          track: expect.objectContaining({ id: 1 }),
        })
      );
    });
    player.play();
    await Promise.resolve();

    let historyCalls = mocks.store.commit.mock.calls.filter(
      ([name]) => name === 'recordClientPlayback'
    );
    expect(historyCalls).toHaveLength(1);

    player._setCurrentTrack({
      id: 2,
      name: 'Track 2',
      ar: [{ name: 'Artist' }],
      al: { name: 'Album' },
      dt: 180000,
    });
    player.play();
    await vi.waitFor(() => {
      historyCalls = mocks.store.commit.mock.calls.filter(
        ([name]) => name === 'recordClientPlayback'
      );
      expect(historyCalls).toHaveLength(2);
    });
    expect(historyCalls[1][1]).toMatchObject({
      recordSource: false,
      track: { id: 2 },
    });
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

  it('syncs stale paused UI state when native audio is already playing', async () => {
    vi.useFakeTimers();
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    audio.playing.mockReturnValue(true);
    audio.currentTime.mockReturnValue(42);
    player._playing = false;
    player._progress = 10;
    player._audioToken = 7;
    player._currentTrack = { id: 1, dt: 180000 };

    mocks.audioHandlers[0].onPlaying(7);

    expect(player.playing).toBe(true);
    expect(player.progress).toBe(42);
    expect(player._progressFrame).not.toBeNull();
    vi.useRealTimers();
  });

  it('refreshes stale UI state before handling a play button click', async () => {
    vi.useFakeTimers();
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    audio.playing.mockReturnValue(true);
    audio.currentTime.mockReturnValue(24);
    player._playing = false;
    player._progress = 3;
    player._currentTrack = { id: 1, dt: 180000 };

    player.playOrPause();

    expect(player.playing).toBe(false);
    expect(player.progress).toBe(24);

    await vi.advanceTimersByTimeAsync(300);

    expect(audio.pause).toHaveBeenCalled();
    expect(player.playing).toBe(false);
    vi.useRealTimers();
  });

  it('shows playing state before the audio fade completes', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    let finishFade;
    audio.fade.mockImplementation(
      () =>
        new Promise(resolve => {
          finishFade = resolve;
        })
    );

    player.play();

    expect(player.playing).toBe(true);
    await vi.waitFor(() => expect(audio.fade).toHaveBeenCalledOnce());
    expect(player.playing).toBe(true);
    finishFade();
  });

  it('rolls back optimistic playing state when audio playback fails', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    const error = new Error('device unavailable');
    audio.play.mockRejectedValue(error);
    mocks.store.dispatch.mockClear();

    player.play();

    expect(player.playing).toBe(true);
    await vi.waitFor(() => expect(player.playing).toBe(false));
    expect(mocks.store.dispatch).toHaveBeenCalledWith(
      'showToast',
      '播放失败：device unavailable'
    );
  });

  it('rolls back optimistic paused state when the device pause fails', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    audio.fade.mockResolvedValue();
    audio.pause.mockImplementation(() => {
      throw new Error('pause unavailable');
    });
    player._playing = true;
    player._desiredPlaying = true;
    mocks.store.dispatch.mockClear();

    player.pause();

    expect(player.playing).toBe(false);
    await vi.waitFor(() => expect(player.playing).toBe(true));
    expect(mocks.store.dispatch).toHaveBeenCalledWith(
      'showToast',
      '暂停失败：pause unavailable'
    );
  });

  it('cancels a pending pause immediately when play is clicked again', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    audio.playing.mockReturnValue(true);
    audio.fade.mockReturnValue(new Promise(() => {}));
    player._playing = true;
    player._desiredPlaying = true;

    player.pause();
    expect(player.playing).toBe(false);

    player.play();

    expect(player.playing).toBe(true);
    expect(player._playbackIntentPending).toBe(false);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('ignores a stale play completion after a newer pause intent', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    let resolvePlay;
    audio.play.mockReturnValue(
      new Promise(resolve => {
        resolvePlay = resolve;
      })
    );

    player.play();
    player.pause();
    resolvePlay();
    await vi.waitFor(() => expect(audio.pause).toHaveBeenCalled());

    expect(player.playing).toBe(false);
    expect(player._desiredPlaying).toBe(false);
    expect(mocks.mediaSession.playbackState).toBe('paused');
  });

  it('keeps the final intent after ten rapid play/pause clicks', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    const playResolvers = [];
    audio.play.mockImplementation(
      () =>
        new Promise(resolve => {
          playResolvers.push(resolve);
        })
    );

    for (let index = 0; index < 10; index += 1) {
      player.playOrPause();
      await Promise.resolve();
    }
    for (const resolve of playResolvers) resolve();
    await vi.waitFor(() => expect(audio.pause).toHaveBeenCalled());

    expect(player.playing).toBe(false);
    expect(player._desiredPlaying).toBe(false);
    expect(mocks.mediaSession.playbackState).toBe('paused');
  });

  it('flushes the AudioEngine position immediately when pausing', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    audio.currentTime.mockReturnValue(133.25);
    player._currentTrack = { id: 1, dt: 180000 };
    player._progress = 132;

    player.pause();

    expect(localStorage.getItem('playerCurrentTrackTime')).toBe('133.25');
    await vi.waitFor(() => expect(audio.pause).toHaveBeenCalled());
  });

  it('syncs stale playing UI state when native audio pauses', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    audio.playing.mockReturnValue(false);
    audio.currentTime.mockReturnValue(25);
    player._playing = true;
    player._progress = 24;
    player._audioToken = 9;
    player._progressFrame = setTimeout(() => {}, 1000);
    player._currentTrack = { id: 1, dt: 180000 };

    mocks.audioHandlers[0].onPause(9);

    expect(player.playing).toBe(false);
    expect(player.progress).toBe(25);
    expect(player._progressFrame).toBeNull();
  });

  it('bumps player version when playing state changes', async () => {
    const player = await createPlayer();
    globalThis.yesplaymusicStore = mocks.store;

    player._setPlaying(true);

    expect(mocks.store.commit).toHaveBeenCalledWith('bumpPlayerVersion');
    delete globalThis.yesplaymusicStore;
  });

  it('bumps only the progress version when progress syncs', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    audio.currentTime.mockReturnValue(12);
    player._currentTrack = { id: 1, dt: 180000 };
    mocks.store.commit.mockClear();

    player._syncProgress(true);

    expect(player.progress).toBe(12);
    expect(mocks.store.commit).toHaveBeenCalledWith(
      'bumpPlayerProgressVersion'
    );
    expect(mocks.store.commit).not.toHaveBeenCalledWith('bumpPlayerVersion');
  });

  it('publishes automatic progress at most once per second', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    player._currentTrack = { id: 1, dt: 180000 };
    audio.currentTime.mockReturnValue(10);
    player._syncProgress();
    mocks.store.commit.mockClear();

    audio.currentTime.mockReturnValue(11);
    await vi.advanceTimersByTimeAsync(999);
    player._syncProgress();
    expect(player.progress).toBe(10);
    expect(mocks.store.commit).not.toHaveBeenCalledWith(
      'bumpPlayerProgressVersion'
    );

    await vi.advanceTimersByTimeAsync(1);
    player._syncProgress();
    expect(player.progress).toBe(11);
    expect(mocks.store.commit).toHaveBeenCalledWith(
      'bumpPlayerProgressVersion'
    );
    vi.useRealTimers();
  });

  it('publishes a forced seek immediately', async () => {
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    player._currentTrack = { id: 1, dt: 180000 };
    audio.currentTime.mockReturnValue(33);
    player._lastProgressUiSyncAt = Date.now();
    mocks.store.commit.mockClear();

    player.seek(33);

    expect(audio.seek).toHaveBeenCalledWith(33);
    expect(player.progress).toBe(33);
    expect(mocks.store.commit).toHaveBeenCalledWith(
      'bumpPlayerProgressVersion'
    );
  });

  it('uses semantic and track versions for a display-track transition', async () => {
    const player = await createPlayer();
    player._currentTrack = { id: 1 };
    mocks.store.commit.mockClear();

    player._setDisplayTrackTarget(2);

    expect(mocks.store.commit).toHaveBeenCalledWith('bumpPlayerVersion');
    expect(mocks.store.commit).toHaveBeenCalledWith('bumpPlayerTrackVersion');
    expect(mocks.store.commit).toHaveBeenCalledWith(
      'bumpPlayerProgressVersion'
    );
  });

  it('publishes semantic volume changes immediately', async () => {
    const player = await createPlayer();
    player._volume = 0.5;
    mocks.store.commit.mockClear();

    player.volume = 0.75;

    expect(mocks.store.commit).toHaveBeenCalledWith('bumpPlayerVersion');
    expect(mocks.store.commit).not.toHaveBeenCalledWith(
      'bumpPlayerProgressVersion'
    );
  });

  it('coalesces rapid semantic changes into one deferred persistence pass', async () => {
    vi.useFakeTimers();
    const player = await createPlayer();
    const save = vi
      .spyOn(player, 'saveSelfToLocalStorage')
      .mockReturnValue(true);
    const sync = vi.spyOn(player, 'sendSelfToIpcMain');

    player.volume = 0.7;
    player.volume = 0.5;
    player.volume = 0.3;

    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(149);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(sync).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('keeps effective state and reports persistence failures', async () => {
    vi.useFakeTimers();
    const player = await createPlayer();
    const storageError = new Error('storage unavailable');
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw storageError;
    });
    mocks.store.dispatch.mockClear();

    player.volume = 0.25;
    await vi.advanceTimersByTimeAsync(150);

    expect(player.volume).toBe(0.25);
    expect(mocks.store.dispatch).toHaveBeenCalledWith(
      'showToast',
      expect.stringContaining('下次启动可能无法保留')
    );
    setItem.mockRestore();
    vi.useRealTimers();
  });

  it('adopts an Android native queue transition without reloading audio', async () => {
    mocks.isCapacitor = true;
    const player = await createPlayer();
    const audio = mocks.audioInstances[0];
    const first = {
      id: 1,
      name: 'First',
      ar: [{ name: 'Artist' }],
      al: { name: 'Album', picUrl: '' },
      dt: 180000,
    };
    const second = {
      id: 2,
      name: 'Second',
      ar: [{ name: 'Artist' }],
      al: { name: 'Album', picUrl: '' },
      dt: 200000,
    };
    player.list = [1, 2];
    player.current = 0;
    player._setCurrentTrack(first);

    await player._adoptNativeTrackTransition({
      mediaId: '2',
      reason: 'auto',
      source: 'https://example.test/second.mp3',
      track: second,
    });

    expect(player.currentTrack).toBe(second);
    expect(player.current).toBe(1);
    expect(player.currentAudioSource).toBe('https://example.test/second.mp3');
    expect(audio.load).not.toHaveBeenCalled();
    expect(audio.clearNextSource).toHaveBeenCalled();
  });
});

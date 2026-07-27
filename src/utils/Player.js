import { getAlbum } from '@/api/album';
import { getArtist } from '@/api/artist';
import { trackScrobble, trackUpdateNowPlaying } from '@/api/lastfm';
import { fmTrash, personalFM } from '@/api/others';
import { getPlaylistDetail, intelligencePlaylist } from '@/api/playlist';
import { scrobble } from '@/api/track';
import store from '@/store';
import AudioEngine from '@/utils/AudioEngine';
import { isCreateTray, isLinux } from '@/utils/platform';
import { isElectron } from '@/utils/env';
import { emitPlayerEvent, PLAYER_EVENTS } from '@/plugins/playerEvents';
import PlayerQueue from '@/utils/player/Queue';
import { createActor } from 'xstate';
import { createPlayerMachine } from '@/player/playerMachine';
import PlayerResolver, { isCanceledRequest } from '@/player/playerResolver';
import { normalizePlaybackRate } from '@/utils/playbackRate';
const isCreateMpris = isElectron && isLinux;

const PLAY_PAUSE_FADE_DURATION = 200;
const PROGRESS_PERSIST_INTERVAL = 5000;
const PROGRESS_UI_INTERVAL = 16;
const LOW_PERFORMANCE_PROGRESS_UI_INTERVAL = 40;
const PROGRESS_STORAGE_INTERVAL = 1000;
const PROGRESS_IMMEDIATE_DELTA = 0.005;
const STALL_RECOVERY_TIMEOUT = 12000;
const STALL_RECOVERY_MIN_REMAINING = 3;

/**
 * @readonly
 * @enum {string}
 */
const UNPLAYABLE_CONDITION = {
  PLAY_NEXT_TRACK: 'playNextTrack',
  PLAY_PREV_TRACK: 'playPrevTrack',
};

const electronPlayer = window.electronAPI?.player;
const delay = ms =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });
const excludeSaveKeys = [
  '_playing',
  '_personalFMLoading',
  '_personalFMNextLoading',
];

function formatTrackDebugLabel(track) {
  if (!track) return 'unknown #0';
  const name = track.name || 'unknown';
  const id = track.id || 0;
  const artists = Array.isArray(track.ar)
    ? track.ar
        .map(a => a?.name)
        .filter(Boolean)
        .join(', ')
    : '';
  return `${name}${artists ? ` by ${artists}` : ''} #${id}`;
}

function setTitle(track) {
  document.title = track
    ? `${track.name} · ${track.ar[0].name} - YesPlayMusic`
    : 'YesPlayMusic';
  if (isCreateTray) {
    electronPlayer?.updateTrayTooltip(document.title);
  }
  getRuntimeStore()?.commit('updateTitle', document.title);
}

function setTrayLikeState(isLiked) {
  if (isCreateTray) {
    electronPlayer?.updateTrayLikeState(isLiked);
  }
}

function getRuntimeStore() {
  return globalThis?.yesplaymusicStore || null;
}

function getProgressUiInterval() {
  const settings = store.state.settings;
  const mode =
    settings.performanceMode ||
    (settings.lowPerformanceMode ? 'balanced' : 'off');
  if (mode === 'aggressive') return 100;
  if (mode === 'balanced') return LOW_PERFORMANCE_PROGRESS_UI_INTERVAL;
  return PROGRESS_UI_INTERVAL;
}

function createPendingTrack(id) {
  return {
    id,
    name: '加载中',
    ar: [],
    al: {
      id: 0,
      picUrl: '',
    },
    dt: 1000,
  };
}

export default class {
  constructor() {
    // 播放器状态
    this._playing = false; // 是否正在播放中
    this._progress = 0; // 当前播放歌曲的进度
    this._enabled = false; // 是否启用Player
    this._repeatMode = 'off'; // off | on | one
    this._shuffle = false; // true | false
    this._reversed = false;
    this._volume = 1; // 0 to 1
    this._volumeBeforeMuted = 1; // 用于保存静音前的音量
    this._playbackRate = 1;
    this._personalFMLoading = false; // 是否正在私人FM中加载新的track
    this._personalFMNextLoading = false; // 是否正在缓存私人FM的下一首歌曲

    // 播放信息
    this._list = []; // 播放列表
    this._current = 0; // 当前播放歌曲在播放列表里的index
    this._shuffledList = []; // 被随机打乱的播放列表，随机播放模式下会使用此播放列表
    this._shuffledCurrent = 0; // 当前播放歌曲在随机列表里面的index
    this._playlistSource = { type: 'album', id: 123 }; // 当前播放列表的信息
    this._currentTrack = { id: 86827685 }; // 当前播放歌曲的详细信息
    this._displayTrackID = 86827685; // UI 目标歌曲，切歌时立即更新
    this._displayTrack = this._currentTrack;
    this._isTrackPending = false;
    this._currentAudioSource = ''; // 当前播放音频地址，用于展示来源信息
    this._audioToken = 0; // 防止旧音频回调污染新的播放源
    this._trackRequestToken = 0; // 防止旧切歌请求污染当前播放状态
    this._trackLoadResolve = null;
    this._prefetchToken = 0;
    this._prefetchingTrackId = null;
    this._trackSwitchTimer = null;
    this._trackRequestAbortController = null;
    this._reactiveSelf = this; // Vuex Proxy 创建后会回绑，用于音频事件触发响应式更新
    this._progressFrame = null;
    this._stallRecoveryTimer = null;
    this._stallRecoveryToken = 0;
    this._recoveringStall = false;
    this._lastProgressUiSyncAt = 0;
    this._progressSyncTimer = null;
    this._progressPersistTimer = null;
    this._playNextList = []; // 当这个list不为空时，会优先播放这个list的歌
    this._queue = new PlayerQueue();
    this._resolver = new PlayerResolver({
      createBlobUrl: data => this._getAudioSourceBlobURL(data),
    });
    this._trackActor = createActor(
      createPlayerMachine({
        loadTarget: this._loadTrackTarget.bind(this),
      })
    ).start();
    this._isPersonalFM = false; // 是否是私人FM模式
    this._personalFMTrack = { id: 0 }; // 私人FM当前歌曲
    this._personalFMNextTrack = {
      id: 0,
    }; // 私人FM下一首歌曲信息（为了快速加载下一首）

    /**
     * The blob records for cleanup.
     *
     * @private
     * @type {string[]}
     */
    this.createdBlobRecords = [];

    this._audio = new AudioEngine({
      onEnded: token => {
        const player = this._getReactiveSelf();
        if (token === player._audioToken) player._nextTrackCallback();
      },
      onTimeUpdate: () => {
        const player = this._getReactiveSelf();
        player._clearStallRecoveryTimer();
        player._syncProgress();
      },
      onLoadedMetadata: () => {
        this._getReactiveSelf()._syncProgress();
      },
      onCanPlay: token => {
        const player = this._getReactiveSelf();
        if (token === player._audioToken) player._clearStallRecoveryTimer();
      },
      onPlaying: token => {
        const player = this._getReactiveSelf();
        if (token === player._audioToken) player._syncNativePlaybackState();
      },
      onPause: token => {
        const player = this._getReactiveSelf();
        if (token === player._audioToken) player._syncNativePlaybackState();
      },
      onStalled: token => {
        const player = this._getReactiveSelf();
        if (token === player._audioToken) player._scheduleStallRecovery();
      },
      onWaiting: token => {
        const player = this._getReactiveSelf();
        if (token === player._audioToken) player._scheduleStallRecovery();
      },
      onError: (error, token) => {
        const player = this._getReactiveSelf();
        if (token === player._audioToken) player._handleAudioError(error);
      },
    });
    Object.defineProperty(this, '_audio', {
      enumerable: false,
    });
    Object.defineProperty(this, '_queue', {
      enumerable: false,
    });
    Object.defineProperty(this, '_resolver', {
      enumerable: false,
    });
    Object.defineProperty(this, '_trackActor', {
      enumerable: false,
    });
    Object.defineProperty(this, '_trackRequestToken', {
      enumerable: false,
    });
    Object.defineProperty(this, '_trackLoadResolve', {
      enumerable: false,
    });
    Object.defineProperty(this, '_prefetchToken', {
      enumerable: false,
    });
    Object.defineProperty(this, '_prefetchingTrackId', {
      enumerable: false,
    });
    Object.defineProperty(this, '_trackSwitchTimer', {
      enumerable: false,
    });
    Object.defineProperty(this, '_trackRequestAbortController', {
      enumerable: false,
    });
    Object.defineProperty(this, '_reactiveSelf', {
      enumerable: false,
    });
    Object.defineProperty(this, '_progressFrame', {
      enumerable: false,
    });
    Object.defineProperty(this, '_stallRecoveryTimer', {
      enumerable: false,
    });
    Object.defineProperty(this, '_stallRecoveryToken', {
      enumerable: false,
    });
    Object.defineProperty(this, '_recoveringStall', {
      enumerable: false,
    });
    Object.defineProperty(this, '_lastProgressUiSyncAt', {
      enumerable: false,
    });
    Object.defineProperty(this, '_progressSyncTimer', {
      enumerable: false,
    });
    Object.defineProperty(this, '_progressPersistTimer', {
      enumerable: false,
    });

    // init
    this._init();

    window.yesplaymusic = {};
    window.yesplaymusic.player = this;
    Object.defineProperty(window.yesplaymusic, 'currentTrackId', {
      enumerable: true,
      configurable: true,
      get: () => this.currentTrackID,
    });
    Object.defineProperty(window.yesplaymusic, 'currentTrackLabel', {
      enumerable: true,
      configurable: true,
      get: () => {
        const track = this.currentTrack;
        if (!track) return '';
        const name = track.name || 'unknown';
        const id = track.id || 0;
        return `${name} #${id}`;
      },
    });
  }

  bindReactiveSelf(player) {
    this._reactiveSelf = player;
    window.yesplaymusic.player = player;
    Object.defineProperty(window.yesplaymusic, 'currentTrackId', {
      enumerable: true,
      configurable: true,
      get: () => player.currentTrackID,
    });
    Object.defineProperty(window.yesplaymusic, 'currentTrackLabel', {
      enumerable: true,
      configurable: true,
      get: () => {
        const track = player.currentTrack;
        if (!track) return '';
        const name = track.name || 'unknown';
        const id = track.id || 0;
        return `${name} #${id}`;
      },
    });
  }

  _getReactiveSelf() {
    return this._reactiveSelf || this;
  }

  _syncQueueState() {
    if (!this._queue) return;
    this._queue.importState({
      list: this._list,
      current: this._current,
      shuffledList: this._shuffledList,
      shuffledCurrent: this._shuffledCurrent,
      shuffleEnabled: this._shuffle,
      repeatMode: this._repeatMode,
      reversed: this._reversed,
      playNextList: this._playNextList,
    });
  }

  _exportQueueState() {
    if (!this._queue) return;
    const state = this._queue.exportState();
    this._list = state.list;
    this._current = state.current;
    this._shuffledList = state.shuffledList;
    this._shuffledCurrent = state.shuffledCurrent;
    this._shuffle = state.shuffleEnabled;
    this._repeatMode = state.repeatMode;
    this._reversed = state.reversed;
    this._playNextList = state.playNextList;
  }

  get repeatMode() {
    return this._queue?.repeatMode ?? this._repeatMode;
  }
  set repeatMode(mode) {
    if (this._guardNotPersonalFM()) return;
    if (!['off', 'on', 'one'].includes(mode)) {
      console.warn("repeatMode: invalid args, must be 'on' | 'off' | 'one'");
      return;
    }
    this._queue.repeatMode = mode;
    this._exportQueueState();
    this.persist();
  }
  get shuffle() {
    return this._queue?.shuffleEnabled ?? this._shuffle;
  }
  set shuffle(shuffle) {
    if (this._guardNotPersonalFM()) return;
    if (shuffle !== true && shuffle !== false) {
      console.warn('shuffle: invalid args, must be Boolean');
      return;
    }
    this._queue.shuffleEnabled = shuffle;
    if (shuffle) {
      this._shuffleTheList();
    }
    // 同步当前歌曲在列表中的下标
    this.current = this.list.indexOf(this.currentTrackID);
    this._exportQueueState();
    this.persist();
  }
  get reversed() {
    return this._queue?.reversed ?? this._reversed;
  }
  set reversed(reversed) {
    if (this._guardNotPersonalFM()) return;
    if (reversed !== true && reversed !== false) {
      console.warn('reversed: invalid args, must be Boolean');
      return;
    }
    this._queue.reversed = reversed;
    this._exportQueueState();
    this.persist();
  }
  get volume() {
    return this._volume;
  }
  set volume(volume) {
    this._volume = volume;
    this._audio?.volume(volume);
    this.persist();
  }
  get playbackRate() {
    return this._playbackRate;
  }
  set playbackRate(value) {
    this._playbackRate = normalizePlaybackRate(value);
    this._audio?.playbackRate(this._playbackRate);
    if (this._enabled) this._updateMediaSessionPositionState();
    this.updateMprisState({ rate: this._playbackRate });
    this.persist();
  }
  get list() {
    return (
      this._queue?.activeList ??
      (this.shuffle ? this._shuffledList : this._list)
    );
  }
  set list(list) {
    this._queue.list = list;
    this._exportQueueState();
  }
  get current() {
    return (
      this._queue?.activeCurrent ??
      (this.shuffle ? this._shuffledCurrent : this._current)
    );
  }
  set current(current) {
    this._queue.activeCurrent = current;
    this._exportQueueState();
  }
  get enabled() {
    return this._enabled;
  }
  get playing() {
    return this._playing;
  }
  get currentTrack() {
    return this._currentTrack;
  }
  get displayTrack() {
    return this._displayTrack || this._currentTrack || createPendingTrack(0);
  }
  get displayTrackID() {
    return this._displayTrackID || this.currentTrackID;
  }
  get isTrackPending() {
    return this._isTrackPending;
  }
  get currentAudioSource() {
    return this._currentAudioSource;
  }
  get currentTrackID() {
    return this._currentTrack?.id ?? 0;
  }
  get playlistSource() {
    return this._playlistSource;
  }
  get playNextList() {
    return this._queue?.playNextList ?? this._playNextList;
  }
  get isPersonalFM() {
    return this._isPersonalFM;
  }
  get personalFMTrack() {
    return this._personalFMTrack;
  }
  get currentTrackDuration() {
    const trackDuration = this._currentTrack.dt || 1000;
    let duration = ~~(trackDuration / 1000);
    return duration > 1 ? duration - 1 : duration;
  }
  get progress() {
    return this._progress;
  }
  set progress(value) {
    if (this._audio) {
      this._audio.seek(value);
      this._syncProgress();
      if (isCreateMpris) {
        this.updateMprisState({
          position: this._audio.currentTime(),
          seeked: true,
        });
      }
    }
  }
  get isCurrentTrackLiked() {
    return store.state.liked.songs.includes(this.displayTrackID);
  }

  persist() {
    this.saveSelfToLocalStorage();
    this.sendSelfToIpcMain();
  }

  syncPlaybackState() {
    this._syncNativePlaybackState();
  }

  _schedulePersist() {
    if (this._progressPersistTimer !== null) return;
    this._progressPersistTimer = setTimeout(() => {
      this._progressPersistTimer = null;
      this.saveSelfToLocalStorage();
    }, PROGRESS_PERSIST_INTERVAL);
  }

  _guardNotPersonalFM() {
    return this._isPersonalFM;
  }

  _canDiscordPresence() {
    return (
      isElectron && store.state.settings.enableDiscordRichPresence !== false
    );
  }

  _init() {
    this._loadSelfFromLocalStorage();
    this._audio?.volume(this.volume);
    this._playbackRate = normalizePlaybackRate(this._playbackRate);
    this._audio?.playbackRate(this._playbackRate);

    if (this._enabled) {
      // 恢复当前播放歌曲
      this._replaceCurrentTrack(this.currentTrackID, false).then(() => {
        this.seek(localStorage.getItem('playerCurrentTrackTime') ?? 0, false);
      }); // update audio source and init audio engine
      this._initMediaSession();
    }

    // 初始化私人FM
    if (
      this._personalFMTrack.id === 0 ||
      this._personalFMNextTrack.id === 0 ||
      this._personalFMTrack.id === this._personalFMNextTrack.id
    ) {
      personalFM().then(result => {
        this._personalFMTrack = result.data[0];
        this._personalFMNextTrack = result.data[1];
        return this._personalFMTrack;
      });
    }
  }
  _setPlaying(isPlaying) {
    const changed = this._playing !== isPlaying;
    this._playing = isPlaying;
    this.persist();
    if (changed) {
      getRuntimeStore()?.commit('bumpPlayerVersion');
    }
    if (isCreateTray) {
      electronPlayer?.updateTrayPlayState(this._playing);
    }
  }
  _syncNativePlaybackState() {
    const isPlaying = this._audio?.playing?.() ?? false;
    if (isPlaying !== this._playing) {
      this._setPlaying(isPlaying);
    }
    this._syncProgress(true);
    if (isPlaying) {
      this._startProgressLoop();
    } else {
      this._stopProgressLoop();
    }
  }
  _setCurrentTrack(track) {
    console.debug(
      `[debug][Player.js] currentTrack => ${formatTrackDebugLabel(track)}`
    );
    this._currentTrack = track;
    this._displayTrack = track;
    this._displayTrackID = track?.id ?? 0;
    this._isTrackPending = false;
    const runtimeStore = getRuntimeStore();
    if (runtimeStore) {
      this.persist();
      runtimeStore.commit('bumpPlayerVersion');
    }
    emitPlayerEvent(PLAYER_EVENTS.TRACK_CHANGE, { track });
  }
  _setDisplayTrackTarget(trackId) {
    this._displayTrackID = trackId;
    this._displayTrack =
      this._currentTrack?.id === trackId
        ? this._currentTrack
        : createPendingTrack(trackId);
    this._isTrackPending = this._currentTrack?.id !== trackId;
    this._progress = 0;
    getRuntimeStore()?.commit('bumpPlayerVersion');
  }
  _syncProgress(force = false) {
    if (!this._audio) return;
    const now = Date.now();
    const progressUiInterval = getProgressUiInterval();
    const duration = this.currentTrackDuration;
    const nextProgress = Math.min(this._audio.currentTime(), duration);
    const progressDelta = Math.abs(nextProgress - (this._progress || 0));

    if (
      !force &&
      progressDelta < PROGRESS_IMMEDIATE_DELTA &&
      now - this._lastProgressUiSyncAt < progressUiInterval
    ) {
      return;
    }

    this._lastProgressUiSyncAt = now;
    this._progress = nextProgress;
    getRuntimeStore()?.commit('bumpPlayerVersion');

    if (this._progressSyncTimer === null) {
      this._progressSyncTimer = setTimeout(() => {
        this._progressSyncTimer = null;
        localStorage.setItem('playerCurrentTrackTime', this._progress);
      }, PROGRESS_STORAGE_INTERVAL);
    }
    this._schedulePersist();
  }
  _startProgressLoop() {
    if (this._progressFrame !== null) return;
    const tick = () => {
      const player = this._getReactiveSelf();
      player._syncProgress();
      if (player.playing) {
        player._progressFrame = setTimeout(tick, getProgressUiInterval());
        return;
      }
      player._stopProgressLoop();
    };
    this._progressFrame = setTimeout(tick, getProgressUiInterval());
  }
  _stopProgressLoop() {
    if (this._progressFrame === null) return;
    clearTimeout(this._progressFrame);
    this._progressFrame = null;
  }
  _clearStallRecoveryTimer() {
    if (this._stallRecoveryTimer === null) return;
    clearTimeout(this._stallRecoveryTimer);
    this._stallRecoveryTimer = null;
  }
  _scheduleStallRecovery() {
    if (!this._playing || this._recoveringStall) return;
    if (!this.currentTrackID || !this._currentAudioSource) return;
    const duration = this.currentTrackDuration;
    if (
      duration > 0 &&
      duration - this.progress <= STALL_RECOVERY_MIN_REMAINING
    ) {
      return;
    }
    this._clearStallRecoveryTimer();
    const token = ++this._stallRecoveryToken;
    const stalledAt = this.progress;
    this._stallRecoveryTimer = setTimeout(() => {
      this._stallRecoveryTimer = null;
      const player = this._getReactiveSelf();
      if (token !== player._stallRecoveryToken) return;
      if (!player._playing || player._recoveringStall) return;
      if (Math.abs(player.progress - stalledAt) > 0.5) return;
      player._recoverStalledPlayback(stalledAt);
    }, STALL_RECOVERY_TIMEOUT);
  }
  _recoverStalledPlayback(progress) {
    if (!this.currentTrackID) return;
    this._recoveringStall = true;
    console.debug(
      `[debug][Player.js] recover stalled playback => ${formatTrackDebugLabel(this._currentTrack)} progress:${progress}`
    );
    this._replaceCurrentTrackAudio(
      this.currentTrack,
      true,
      false,
      UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK,
      this._trackRequestToken,
      undefined,
      { bypassCache: true }
    )
      .then(replaced => {
        if (!replaced) return;
        this.seek(progress, false);
        this.play();
      })
      .finally(() => {
        this._recoveringStall = false;
      });
  }
  _handleAudioError(error) {
    this._clearStallRecoveryTimer();
    emitPlayerEvent(PLAYER_EVENTS.AUDIO_ERROR, {
      error,
      track: this._currentTrack,
    });
    const errorCode = error?.code;
    // https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code
    if (errorCode === 3) {
      this._playNextTrack(this._isPersonalFM);
    } else if (errorCode === 4) {
      store.dispatch('showToast', `无法播放: 不支持的音频格式`);
      this._playNextTrack(this._isPersonalFM);
    } else {
      const t = this.progress;
      this._replaceCurrentTrackAudio(this.currentTrack, false, false).then(
        replaced => {
          if (replaced) {
            this.seek(t, false);
            this.play();
          }
        }
      );
    }
  }
  _getSiblingTrack(forward) {
    this._syncQueueState();
    return this._queue.getSibling(forward);
  }
  async _shuffleTheList(firstTrackID = this.currentTrackID) {
    this._queue.shuffle(firstTrackID);
    this._exportQueueState();
  }
  async _scrobble(track, time, completed = false) {
    console.debug(
      `[debug][Player.js] scrobble track 👉 ${track.name} by ${track.ar[0].name} 👉 time:${time} completed: ${completed}`
    );
    const trackDuration = ~~(track.dt / 1000);
    time = completed ? trackDuration : ~~time;
    scrobble({
      id: track.id,
      sourceid: this.playlistSource.id,
      time,
    });
    if (
      store.state.lastfm.key !== undefined &&
      (time >= trackDuration / 2 || time >= 240)
    ) {
      const timestamp = ~~(new Date().getTime() / 1000) - time;
      trackScrobble({
        artist: track.ar[0].name,
        track: track.name,
        timestamp,
        album: track.al.name,
        trackNumber: track.no,
        duration: trackDuration,
      });
    }
  }
  _playAudioSource(source, autoplay = true) {
    if (!source || typeof source !== 'string') {
      store.dispatch('showToast', `无法播放: 无可用音源`);
      this._playNextTrack(this._isPersonalFM);
      return;
    }
    this._progress = 0;
    this._clearStallRecoveryTimer();
    this._stallRecoveryToken += 1;
    this._currentAudioSource = source;
    this._audioToken += 1;
    console.debug(
      `[debug][Player.js] loadAudioSource => ${formatTrackDebugLabel(this._currentTrack)} source:${source}`
    );
    this._audio.load(source, this._audioToken);
    this._audio.playbackRate(this._playbackRate);
    emitPlayerEvent(PLAYER_EVENTS.AUDIO_LOADED, {
      source,
      track: this._currentTrack,
      autoplay,
    });
    if (autoplay) {
      this.play();
      if (this._currentTrack.name) {
        setTitle(this._currentTrack);
      }
      setTrayLikeState(store.state.liked.songs.includes(this.currentTrack.id));
    }
    this.setOutputDevice();
  }
  _getAudioSourceBlobURL(data) {
    // Create a new object URL.
    const source = URL.createObjectURL(new Blob([data]));

    // Clean up the previous object URLs since we've created a new one.
    // Revoke object URLs can release the memory taken by a Blob,
    // which occupied a large proportion of memory.
    for (const url in this.createdBlobRecords) {
      URL.revokeObjectURL(url);
    }

    // Then, we replace the createBlobRecords with new one with
    // our newly created object URL.
    this.createdBlobRecords = [source];

    return source;
  }
  _isTrackRequestCurrent(token) {
    return token === undefined || token === this._trackRequestToken;
  }
  _abortTrackRequest() {
    this._trackRequestAbortController?.abort();
    this._trackRequestAbortController = null;
  }
  _syncQueueCurrentToTrack(trackId) {
    if (!this._queue?.syncCurrentToTrack(trackId)) return false;
    this._exportQueueState();
    return true;
  }
  _startTrackLoadWaiter() {
    this._trackLoadResolve?.(false);
    return new Promise(resolve => {
      this._trackLoadResolve = resolve;
    });
  }
  _resolveTrackLoad(result) {
    this._trackLoadResolve?.(result);
    this._trackLoadResolve = null;
  }
  _queueReplaceCurrentTrack(
    id,
    autoplay = true,
    ifUnplayableThen = UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK
  ) {
    if (this._trackSwitchTimer !== null) {
      clearTimeout(this._trackSwitchTimer);
    }
    this._trackRequestToken += 1;
    this._prefetchToken += 1;
    this._stallRecoveryToken += 1;
    this._clearStallRecoveryTimer();
    this._prefetchingTrackId = null;
    this._abortTrackRequest();
    this._syncQueueCurrentToTrack(id);
    this._setDisplayTrackTarget(id);
    const loadPromise = this._startTrackLoadWaiter();
    this._trackActor.send({
      type: 'TARGET_CHANGED',
      trackId: id,
      autoplay,
      ifUnplayableThen,
    });
    return loadPromise;
  }
  _loadTrackTarget({ trackId, autoplay, ifUnplayableThen, signal }) {
    const requestToken = this._trackRequestToken;
    return this._resolver
      .loadTrack(trackId, { signal })
      .then(track => {
        if (!this._isTrackRequestCurrent(requestToken)) return false;
        this._setCurrentTrack(track);
        this._updateMediaSessionMetaData(track);
        return this._replaceCurrentTrackAudio(
          track,
          autoplay,
          true,
          ifUnplayableThen,
          requestToken,
          signal
        );
      })
      .then(result => {
        if (this._isTrackRequestCurrent(requestToken)) {
          this._resolveTrackLoad(result);
        }
        return result;
      })
      .catch(error => {
        if (isCanceledRequest(error)) return false;
        if (!this._isTrackRequestCurrent(requestToken)) return false;
        console.debug('[debug][Player.js] replaceCurrentTrack failed', error);
        store.dispatch('showToast', `歌曲加载超时，请重试`);
        this._resolveTrackLoad(false);
        return false;
      });
  }
  _replaceCurrentTrack(
    id,
    autoplay = true,
    ifUnplayableThen = UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK
  ) {
    console.debug(
      `[debug][Player.js] replaceCurrentTrack => id:${id} autoplay:${autoplay} current:${formatTrackDebugLabel(this._currentTrack)}`
    );
    if (autoplay && this._currentTrack.name) {
      this._scrobble(this.currentTrack, this.seek(null, false));
    }
    return this._queueReplaceCurrentTrack(id, autoplay, ifUnplayableThen);
  }
  /**
   * @returns 是否成功加载音频，并使用加载完成的音频替换了当前播放源
   */
  _replaceCurrentTrackAudio(
    track,
    autoplay,
    isCacheNextTrack,
    ifUnplayableThen = UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK,
    requestToken,
    signal,
    resolveOptions = {}
  ) {
    return this._resolver
      .resolveSource(track, { ...resolveOptions, signal })
      .then(source => {
        if (!this._isTrackRequestCurrent(requestToken)) return false;
        if (source) {
          let replaced = false;
          if (track.id === this.currentTrackID) {
            this._playAudioSource(source, autoplay);
            replaced = true;
          }
          if (isCacheNextTrack) {
            this._cacheNextTrack();
          }
          return replaced;
        } else {
          store.dispatch('showToast', `无法播放 ${track.name}`);
          switch (ifUnplayableThen) {
            case UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK:
              this._playNextTrack(this.isPersonalFM);
              break;
            case UNPLAYABLE_CONDITION.PLAY_PREV_TRACK:
              this.playPrevTrack();
              break;
            default:
              store.dispatch(
                'showToast',
                `undefined Unplayable condition: ${ifUnplayableThen}`
              );
              break;
          }
          return false;
        }
      })
      .catch(error => {
        if (isCanceledRequest(error)) return false;
        if (!this._isTrackRequestCurrent(requestToken)) return false;
        console.debug(
          '[debug][Player.js] replaceCurrentTrackAudio failed',
          error
        );
        store.dispatch('showToast', `音源加载超时，请重试`);
        return false;
      });
  }
  _cacheNextTrack() {
    let nextTrackID = this._isPersonalFM
      ? (this._personalFMNextTrack?.id ?? 0)
      : this._getSiblingTrack(true)[0];
    if (!nextTrackID) return;
    if (this._personalFMTrack.id == nextTrackID) return;
    if (this._prefetchingTrackId === nextTrackID) return;

    const prefetchToken = ++this._prefetchToken;
    this._prefetchingTrackId = nextTrackID;
    this._resolver
      .loadTrack(nextTrackID)
      .then(track => {
        if (prefetchToken !== this._prefetchToken) return null;
        return this._resolver.resolveSource(track);
      })
      .catch(error => {
        console.debug('[debug][Player.js] cacheNextTrack failed', error);
      })
      .finally(() => {
        if (prefetchToken === this._prefetchToken) {
          this._prefetchingTrackId = null;
        }
      });
  }
  _loadSelfFromLocalStorage() {
    const player = JSON.parse(localStorage.getItem('player'));
    if (!player) return;
    for (const [key, value] of Object.entries(player)) {
      this[key] = value;
    }
    this._syncQueueState();
  }
  _initMediaSession() {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        this.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        this.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        this.playPrevTrack();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        this._playNextTrack(this.isPersonalFM);
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        this.pause();
      });
      navigator.mediaSession.setActionHandler('seekto', event => {
        this.seek(event.seekTime);
        this._updateMediaSessionPositionState();
      });
      navigator.mediaSession.setActionHandler('seekbackward', event => {
        this.seek(this.seek() - (event.seekOffset || 10));
        this._updateMediaSessionPositionState();
      });
      navigator.mediaSession.setActionHandler('seekforward', event => {
        this.seek(this.seek() + (event.seekOffset || 10));
        this._updateMediaSessionPositionState();
      });
    }
  }
  _updateMediaSessionMetaData(track) {
    let artists = track.ar.map(a => a.name);
    const metadata = {
      title: track.name,
      artist: artists.join(','),
      album: track.al.name,
      artwork: [
        {
          src: track.al.picUrl + '?param=224y224',
          type: 'image/jpg',
          sizes: '224x224',
        },
        {
          src: track.al.picUrl + '?param=512y512',
          type: 'image/jpg',
          sizes: '512x512',
        },
      ],
      length: this.currentTrackDuration,
      trackId: track.id,
      url: `https://music.163.com/song?id=${track.id}`,
    };

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new window.MediaMetadata(metadata);
    }
    this.updateMprisState({
      metadata: {
        ...metadata,
        artist: artists,
        artwork: metadata.artwork.at(-1)?.src || '',
      },
    });
  }
  _updateMediaSessionPositionState() {
    if ('mediaSession' in navigator === false) {
      return;
    }
    if ('setPositionState' in navigator.mediaSession) {
      navigator.mediaSession.setPositionState({
        duration: ~~(this.currentTrack.dt / 1000),
        playbackRate: this.playbackRate,
        position: this.seek(),
      });
    }
  }
  _nextTrackCallback() {
    const player = this._getReactiveSelf();
    player._scrobble(player._currentTrack, 0, true);
    if (!player.isPersonalFM && player.repeatMode === 'one') {
      player._replaceCurrentTrack(player.currentTrackID);
    } else {
      player._playNextTrack(player.isPersonalFM);
    }
  }
  _loadPersonalFMNextTrack() {
    if (this._personalFMNextLoading) {
      return [false, undefined];
    }
    this._personalFMNextLoading = true;
    return personalFM()
      .then(result => {
        if (!result || !result.data) {
          this._personalFMNextTrack = undefined;
        } else {
          this._personalFMNextTrack = result.data[0];
          this._cacheNextTrack(); // cache next track
        }
        this._personalFMNextLoading = false;
        return [true, this._personalFMNextTrack];
      })
      .catch(() => {
        this._personalFMNextTrack = undefined;
        this._personalFMNextLoading = false;
        return [false, this._personalFMNextTrack];
      });
  }
  _playDiscordPresence(track, seekTime = 0) {
    if (!this._canDiscordPresence()) return null;
    let copyTrack = { ...track };
    copyTrack.dt -= seekTime * 1000;
    electronPlayer?.playDiscordPresence(copyTrack);
  }
  _pauseDiscordPresence(track) {
    if (!this._canDiscordPresence()) return null;
    electronPlayer?.pauseDiscordPresence(track);
  }
  _playNextTrack(isPersonal) {
    if (isPersonal) {
      this.playNextFMTrack();
    } else {
      this.playNextTrack();
    }
  }

  appendTrack(trackID) {
    this._queue.addPlayNext(trackID);
    this._exportQueueState();
  }
  playNextTrack() {
    // TODO: 切换歌曲时增加加载中的状态
    if (this._queue.playNextList.length > 0) {
      const trackID = this._queue.takePlayNext();
      this._exportQueueState();
      this._queueReplaceCurrentTrack(trackID);
      return true;
    }
    const [trackID, index] = this._getSiblingTrack(true);
    if (trackID === undefined) {
      this._trackRequestToken += 1;
      this._prefetchToken += 1;
      this._prefetchingTrackId = null;
      this._abortTrackRequest();
      this._isTrackPending = false;
      this._audio?.stop();
      this._setPlaying(false);
      return false;
    }
    console.debug(
      `[debug][Player.js] playNextTrack => next:${trackID} from:${formatTrackDebugLabel(this._currentTrack)}`
    );
    this.current = index;
    this._queueReplaceCurrentTrack(trackID);
    return true;
  }
  async playNextFMTrack() {
    if (this._personalFMLoading) {
      return false;
    }

    this._isPersonalFM = true;
    if (!this._personalFMNextTrack) {
      this._personalFMLoading = true;
      let result = null;
      let retryCount = 5;
      for (; retryCount >= 0; retryCount--) {
        result = await personalFM().catch(() => null);
        if (!result) {
          this._personalFMLoading = false;
          store.dispatch('showToast', 'personal fm timeout');
          return false;
        }
        if (result.data?.length > 0) {
          break;
        } else if (retryCount > 0) {
          await delay(1000);
        }
      }
      this._personalFMLoading = false;

      if (retryCount < 0) {
        let content = '获取私人FM数据时重试次数过多，请手动切换下一首';
        store.dispatch('showToast', content);
        console.log(content);
        return false;
      }
      // 这里只能拿到一条数据
      this._personalFMTrack = result.data[0];
    } else {
      if (this._personalFMNextTrack.id === this._personalFMTrack.id) {
        return false;
      }
      this._personalFMTrack = this._personalFMNextTrack;
    }
    if (this._isPersonalFM) {
      this._setDisplayTrackTarget(this._personalFMTrack.id);
      this._replaceCurrentTrack(this._personalFMTrack.id);
    }
    this._loadPersonalFMNextTrack();
    return true;
  }
  playPrevTrack() {
    const [trackID, index] = this._getSiblingTrack(false);
    if (trackID === undefined) return false;
    console.debug(
      `[debug][Player.js] playPrevTrack => prev:${trackID} from:${formatTrackDebugLabel(this._currentTrack)}`
    );
    this.current = index;
    this._queueReplaceCurrentTrack(
      trackID,
      true,
      UNPLAYABLE_CONDITION.PLAY_PREV_TRACK
    );
    return true;
  }
  saveSelfToLocalStorage() {
    let player = {};
    for (let [key, value] of Object.entries(this)) {
      if (excludeSaveKeys.includes(key)) continue;
      player[key] = value;
    }

    localStorage.setItem('player', JSON.stringify(player));
  }

  pause() {
    this._clearStallRecoveryTimer();
    this._stallRecoveryToken += 1;
    this._audio?.fade(this.volume, 0, PLAY_PAUSE_FADE_DURATION).then(() => {
      this._audio?.pause();
      this._setPlaying(false);
      this._stopProgressLoop();
      if (this._progressSyncTimer !== null) {
        clearTimeout(this._progressSyncTimer);
        this._progressSyncTimer = null;
      }
      if (this._progressPersistTimer !== null) {
        clearTimeout(this._progressPersistTimer);
        this._progressPersistTimer = null;
      }
      localStorage.setItem('playerCurrentTrackTime', this._progress);
      this.saveSelfToLocalStorage();
      setTitle(null);
      this._pauseDiscordPresence(this._currentTrack);
      emitPlayerEvent(PLAYER_EVENTS.PLAYBACK_PAUSE, {
        track: this._currentTrack,
      });
    });
  }
  play() {
    if (this._audio?.playing()) {
      this._syncNativePlaybackState();
      return;
    }

    // 播放时确保开启player.
    // 避免因"忘记设置"导致在播放时播放器不显示的Bug
    this._enabled = true;
    this._audio
      ?.play()
      .then(() => this._audio?.fade(0, this.volume, PLAY_PAUSE_FADE_DURATION))
      .then(() => {
        this._setPlaying(true);
        this._startProgressLoop();
        emitPlayerEvent(PLAYER_EVENTS.PLAYBACK_PLAY, {
          track: this._currentTrack,
        });
        if (this._currentTrack.name) {
          setTitle(this._currentTrack);
        }
        this._playDiscordPresence(this._currentTrack, this.seek());
        if (store.state.lastfm.key !== undefined) {
          trackUpdateNowPlaying({
            artist: this.currentTrack.ar[0].name,
            track: this.currentTrack.name,
            album: this.currentTrack.al.name,
            trackNumber: this.currentTrack.no,
            duration: ~~(this.currentTrack.dt / 1000),
          });
        }
      })
      .catch(error => {
        // AbortError: play() interrupted by pause()/load() during track switch. Normal, not a failure.
        if (error?.name === 'AbortError') return;
        if (error?.name === 'NotSupportedError') {
          console.debug('[debug][Player.js] unsupported audio source', error);
          return;
        }
        console.error('Failed to play audio', error);
        store.dispatch('showToast', `播放失败`);
      });
  }
  playOrPause() {
    this._syncNativePlaybackState();
    if (this._audio?.playing()) {
      this.pause();
    } else {
      this.play();
    }
  }
  seek(time = null, sendMpris = true) {
    if (time !== null) {
      this._audio?.seek(time);
      this._syncProgress();
      if (this._progressSyncTimer !== null) {
        clearTimeout(this._progressSyncTimer);
        this._progressSyncTimer = null;
      }
      localStorage.setItem('playerCurrentTrackTime', this._progress);
      if (isCreateMpris && sendMpris) {
        this.updateMprisState({ position: this._progress, seeked: true });
      }
      if (this._playing)
        this._playDiscordPresence(this._currentTrack, this.seek(null, false));
    }
    return this._audio === null ? 0 : this._audio.currentTime();
  }
  mute() {
    if (this.volume === 0) {
      this.volume = this._volumeBeforeMuted;
    } else {
      this._volumeBeforeMuted = this.volume;
      this.volume = 0;
    }
  }
  setOutputDevice() {
    this._audio?.setOutputDevice(store.state.settings.outputDevice);
  }

  replacePlaylist(
    trackIDs,
    playlistSourceID,
    playlistSourceType,
    autoPlayTrackID = 'first'
  ) {
    this._isPersonalFM = false;
    this._playlistSource = {
      type: playlistSourceType,
      id: playlistSourceID,
    };
    const trackID = this._queue.replace(trackIDs, autoPlayTrackID);
    this._exportQueueState();
    this._setDisplayTrackTarget(trackID);
    this._replaceCurrentTrack(trackID);
  }
  playAlbumByID(id, trackID = 'first') {
    getAlbum(id).then(data => {
      let trackIDs = data.songs.map(t => t.id);
      this.replacePlaylist(trackIDs, id, 'album', trackID);
    });
  }
  playPlaylistByID(id, trackID = 'first', noCache = false) {
    console.debug(
      `[debug][Player.js] playPlaylistByID 👉 id:${id} trackID:${trackID} noCache:${noCache}`
    );
    getPlaylistDetail(id, noCache).then(data => {
      let trackIDs = data.playlist.trackIds.map(t => t.id);
      const picked = trackID === 'first' ? trackIDs[0] : trackID;
      console.debug(
        `[debug][Player.js] playlistReady => playlist:${id} picked:${picked} target:${formatTrackDebugLabel({ id: picked, name: 'pending' })}`
      );
      this.replacePlaylist(trackIDs, id, 'playlist', trackID);
    });
  }
  playArtistByID(id, trackID = 'first') {
    getArtist(id).then(data => {
      let trackIDs = data.hotSongs.map(t => t.id);
      this.replacePlaylist(trackIDs, id, 'artist', trackID);
    });
  }
  playTrackOnListByID(id, listName = 'default') {
    if (listName === 'default') {
      this.current = this.list.findIndex(t => t === id);
    }
    this._replaceCurrentTrack(id);
  }
  playIntelligenceListById(id, trackID = 'first', noCache = false) {
    getPlaylistDetail(id, noCache).then(data => {
      const randomId = Math.floor(
        Math.random() * (data.playlist.trackIds.length + 1)
      );
      const songId = data.playlist.trackIds[randomId].id;
      intelligencePlaylist({ id: songId, pid: id }).then(result => {
        let trackIDs = result.data.map(t => t.id);
        this.replacePlaylist(trackIDs, id, 'playlist', trackID);
      });
    });
  }
  addTrackToPlayNext(trackID, playNow = false) {
    this._queue.addPlayNext(trackID);
    this._exportQueueState();
    if (playNow) {
      this.playNextTrack();
    }
  }
  playPersonalFM() {
    this._isPersonalFM = true;
    if (this.currentTrackID !== this._personalFMTrack.id) {
      this._replaceCurrentTrack(this._personalFMTrack.id, true);
    } else {
      this.playOrPause();
    }
  }
  async moveToFMTrash() {
    this._isPersonalFM = true;
    let id = this._personalFMTrack.id;
    if (await this.playNextFMTrack()) {
      fmTrash(id);
    }
  }

  sendSelfToIpcMain() {
    if (!isElectron) return false;
    const runtimeStore = getRuntimeStore();
    if (!runtimeStore) return false;
    let liked = runtimeStore.state.liked.songs.includes(this.currentTrack.id);
    electronPlayer?.player({
      playing: this.playing,
      likedCurrentTrack: liked,
    });
    this.updateMprisState({
      loopStatus: this.repeatMode,
      playing: this.playing,
      position: this.progress,
      shuffle: this.shuffle,
      rate: this.playbackRate,
      volume: this.volume,
    });
    setTrayLikeState(liked);
  }

  updateMprisState(state) {
    if (isCreateMpris) electronPlayer?.updateMprisState(state);
  }

  updateMprisLyrics(lyrics, trackId = this.currentTrack?.id) {
    if (!isCreateMpris) return;
    const text = Array.isArray(lyrics)
      ? lyrics
          .map(line => line?.content)
          .filter(content => typeof content === 'string' && content)
          .join('\n')
      : String(lyrics || '');
    this.updateMprisState({
      lyrics: {
        text,
        trackId,
      },
    });
  }

  switchRepeatMode() {
    if (this.repeatMode === 'on') {
      this.repeatMode = 'one';
    } else if (this.repeatMode === 'one') {
      this.repeatMode = 'off';
    } else {
      this.repeatMode = 'on';
    }
    this.updateMprisState({ loopStatus: this.repeatMode });
  }
  switchShuffle() {
    this.shuffle = !this.shuffle;
    this.updateMprisState({ shuffle: this.shuffle });
  }
  switchReversed() {
    this.reversed = !this.reversed;
  }

  clearPlayNextList() {
    this._queue.clearPlayNext();
    this._exportQueueState();
  }
  removeTrackFromQueue(index) {
    this._queue.removePlayNext(index);
    this._exportQueueState();
  }
}

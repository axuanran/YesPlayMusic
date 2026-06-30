import { getAlbum } from '@/api/album';
import { getArtist } from '@/api/artist';
import { trackScrobble, trackUpdateNowPlaying } from '@/api/lastfm';
import { fmTrash, personalFM } from '@/api/others';
import { getPlaylistDetail, intelligencePlaylist } from '@/api/playlist';
import { getLyric, getMP3, getTrackDetail, scrobble } from '@/api/track';
import store from '@/store';
import AudioEngine from '@/utils/AudioEngine';
import { isAccountLoggedIn } from '@/utils/auth';
import { cacheTrackSource, getTrackSource } from '@/utils/db';
import { isCreateTray } from '@/utils/platform';
import { isElectron } from '@/utils/env';
import shuffle from 'lodash/shuffle';
import { resolveTrackSource } from '@/utils/resolveAudioSource';
import { getOuterAudioUrl } from '@/utils/resolveAudioSource';
import { pluginEvents } from '@/plugins/events';
// MPRIS disabled during Electron 42 migration
const isCreateMpris = false;

const PLAY_PAUSE_FADE_DURATION = 200;

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
  store.commit('updateTitle', document.title);
}

function setTrayLikeState(isLiked) {
  if (isCreateTray) {
    electronPlayer?.updateTrayLikeState(isLiked);
  }
}

function emitPlayerEvent(event, payload) {
  try {
    pluginEvents.emit(event, payload);
  } catch (error) {
    console.warn(`[plugins] player event failed: ${event}`, error);
  }
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
    this._personalFMLoading = false; // 是否正在私人FM中加载新的track
    this._personalFMNextLoading = false; // 是否正在缓存私人FM的下一首歌曲

    // 播放信息
    this._list = []; // 播放列表
    this._current = 0; // 当前播放歌曲在播放列表里的index
    this._shuffledList = []; // 被随机打乱的播放列表，随机播放模式下会使用此播放列表
    this._shuffledCurrent = 0; // 当前播放歌曲在随机列表里面的index
    this._playlistSource = { type: 'album', id: 123 }; // 当前播放列表的信息
    this._currentTrack = { id: 86827685 }; // 当前播放歌曲的详细信息
    this._currentAudioSource = ''; // 当前播放音频地址，用于展示来源信息
    this._audioToken = 0; // 防止旧音频回调污染新的播放源
    this._reactiveSelf = this; // Vuex Proxy 创建后会回绑，用于音频事件触发响应式更新
    this._progressFrame = null;
    this._playNextList = []; // 当这个list不为空时，会优先播放这个list的歌
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
        this._getReactiveSelf()._syncProgress();
      },
      onLoadedMetadata: () => {
        this._getReactiveSelf()._syncProgress();
      },
      onError: (error, token) => {
        const player = this._getReactiveSelf();
        if (token === player._audioToken) player._handleAudioError(error);
      },
    });
    Object.defineProperty(this, '_audio', {
      enumerable: false,
    });
    Object.defineProperty(this, '_reactiveSelf', {
      enumerable: false,
    });
    Object.defineProperty(this, '_progressFrame', {
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

  get repeatMode() {
    return this._repeatMode;
  }
  set repeatMode(mode) {
    if (this._guardNotPersonalFM()) return;
    if (!['off', 'on', 'one'].includes(mode)) {
      console.warn("repeatMode: invalid args, must be 'on' | 'off' | 'one'");
      return;
    }
    this._repeatMode = mode;
    this.persist();
  }
  get shuffle() {
    return this._shuffle;
  }
  set shuffle(shuffle) {
    if (this._guardNotPersonalFM()) return;
    if (shuffle !== true && shuffle !== false) {
      console.warn('shuffle: invalid args, must be Boolean');
      return;
    }
    this._shuffle = shuffle;
    if (shuffle) {
      this._shuffleTheList();
    }
    // 同步当前歌曲在列表中的下标
    this.current = this.list.indexOf(this.currentTrackID);
    this.persist();
  }
  get reversed() {
    return this._reversed;
  }
  set reversed(reversed) {
    if (this._guardNotPersonalFM()) return;
    if (reversed !== true && reversed !== false) {
      console.warn('reversed: invalid args, must be Boolean');
      return;
    }
    this._reversed = reversed;
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
  get list() {
    return this.shuffle ? this._shuffledList : this._list;
  }
  set list(list) {
    this._list = list;
  }
  get current() {
    return this.shuffle ? this._shuffledCurrent : this._current;
  }
  set current(current) {
    if (this.shuffle) {
      this._shuffledCurrent = current;
    } else {
      this._current = current;
    }
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
    return this._playNextList;
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
        electronPlayer?.seeked(this._audio.currentTime());
      }
    }
  }
  get isCurrentTrackLiked() {
    return store.state.liked.songs.includes(this.currentTrack.id);
  }

  persist() {
    this.saveSelfToLocalStorage();
    this.sendSelfToIpcMain();
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
    this._playing = isPlaying;
    this.persist();
    if (isCreateTray) {
      electronPlayer?.updateTrayPlayState(this._playing);
    }
  }
  _setCurrentTrack(track) {
    console.debug(
      `[debug][Player.js] currentTrack => ${formatTrackDebugLabel(track)}`
    );
    this._currentTrack = track;
    this.persist();
    store.commit('bumpPlayerVersion');
    emitPlayerEvent('track:change', { track });
  }
  _syncProgress() {
    if (!this._audio) return;
    const duration = this.currentTrackDuration;
    this._progress = Math.min(this._audio.currentTime(), duration);
    localStorage.setItem('playerCurrentTrackTime', this._progress);
    if (isCreateMpris) {
      electronPlayer?.playerCurrentTrackTime(this._progress);
    }
  }
  _startProgressLoop() {
    if (this._progressFrame !== null) return;
    const tick = () => {
      const player = this._getReactiveSelf();
      player._syncProgress();
      if (player.playing) {
        player._progressFrame = requestAnimationFrame(tick);
      } else {
        player._progressFrame = null;
      }
    };
    this._progressFrame = requestAnimationFrame(tick);
  }
  _stopProgressLoop() {
    if (this._progressFrame === null) return;
    cancelAnimationFrame(this._progressFrame);
    this._progressFrame = null;
  }
  _handleAudioError(error) {
    emitPlayerEvent('audio:error', {
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
    const dir = forward ? 1 : -1;
    const next = this._reversed ? this.current - dir : this.current + dir;

    if (this.repeatMode === 'on') {
      const atBoundary = this._reversed
        ? this.current === 0
        : this.current + 1 === this.list.length;
      if (atBoundary) {
        const wrapTo = forward !== this._reversed ? 0 : this.list.length - 1;
        return [this.list[wrapTo], wrapTo];
      }
    }

    return [this.list[next], next];
  }
  async _shuffleTheList(firstTrackID = this.currentTrackID) {
    let list = this._list.filter(tid => tid !== firstTrackID);
    if (firstTrackID === 'first') list = this._list;
    this._shuffledList = shuffle(list);
    if (firstTrackID !== 'first') this._shuffledList.unshift(firstTrackID);
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
    this._progress = 0;
    this._currentAudioSource = source;
    this._audioToken += 1;
    console.debug(
      `[debug][Player.js] loadAudioSource => ${formatTrackDebugLabel(this._currentTrack)} source:${source}`
    );
    this._audio.load(source, this._audioToken);
    emitPlayerEvent('audio:loaded', {
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
  _getAudioSourceFromCache(id) {
    return getTrackSource(id).then(t => {
      if (!t) return null;
      return this._getAudioSourceBlobURL(t.source);
    });
  }
  _getAudioSourceFromNetease(track) {
    if (isAccountLoggedIn()) {
      return getMP3(track.id)
        .then(result => {
          if (!result.data[0]) return null;
          if (!result.data[0].url) return null;
          if (result.data[0].freeTrialInfo !== null) return null; // 跳过只能试听的歌曲
          const source = result.data[0].url.replace(/^http:/, 'https:');
          if (store.state.settings.automaticallyCacheSongs) {
            cacheTrackSource(track, source, result.data[0].br);
          }
          return source;
        })
        .catch(() => {
          return getOuterAudioUrl(track.id);
        });
    } else {
      return Promise.resolve(getOuterAudioUrl(track.id));
    }
  }
  _getAudioSource(track) {
    // Stage 1: Try resolver backend first
    return resolveTrackSource(track).catch(() => {
      // Stage 2: Fall back to full legacy chain
      return this._getAudioSourceLegacy(track);
    });
  }
  _getAudioSourceLegacy(track) {
    return this._getAudioSourceFromCache(String(track.id)).then(source => {
      return source ?? this._getAudioSourceFromNetease(track);
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
    return getTrackDetail(id).then(data => {
      const track = data.songs[0];
      this._setCurrentTrack(track);
      this._updateMediaSessionMetaData(track);
      return this._replaceCurrentTrackAudio(
        track,
        autoplay,
        true,
        ifUnplayableThen
      );
    });
  }
  /**
   * @returns 是否成功加载音频，并使用加载完成的音频替换了当前播放源
   */
  _replaceCurrentTrackAudio(
    track,
    autoplay,
    isCacheNextTrack,
    ifUnplayableThen = UNPLAYABLE_CONDITION.PLAY_NEXT_TRACK
  ) {
    return this._getAudioSource(track).then(source => {
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
    });
  }
  _cacheNextTrack() {
    let nextTrackID = this._isPersonalFM
      ? (this._personalFMNextTrack?.id ?? 0)
      : this._getSiblingTrack(true)[0];
    if (!nextTrackID) return;
    if (this._personalFMTrack.id == nextTrackID) return;
    getTrackDetail(nextTrackID).then(data => {
      let track = data.songs[0];
      this._getAudioSource(track);
    });
  }
  _loadSelfFromLocalStorage() {
    const player = JSON.parse(localStorage.getItem('player'));
    if (!player) return;
    for (const [key, value] of Object.entries(player)) {
      this[key] = value;
    }
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
    if ('mediaSession' in navigator === false) {
      return;
    }
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
      trackId: this.current,
      url: '/trackid/' + track.id,
    };

    navigator.mediaSession.metadata = new window.MediaMetadata(metadata);
    if (isCreateMpris) {
      this._updateMprisState(track, metadata);
    }
  }
  // OSDLyrics 会检测 Mpris 状态并寻找对应歌词文件，所以要在更新 Mpris 状态之前保证歌词下载完成
  async _updateMprisState(track, metadata) {
    if (!store.state.settings.enableOsdlyricsSupport) {
      return electronPlayer?.metadata(metadata);
    }

    let lyricContent = await getLyric(track.id);

    if (!lyricContent.lrc || !lyricContent.lrc.lyric) {
      return electronPlayer?.metadata(metadata);
    }

    electronPlayer?.sendLyrics({
      track,
      lyrics: lyricContent.lrc.lyric,
    });

    electronPlayer?.onSaveLyricFinished(() => {
      electronPlayer?.metadata(metadata);
    });
  }
  _updateMediaSessionPositionState() {
    if ('mediaSession' in navigator === false) {
      return;
    }
    if ('setPositionState' in navigator.mediaSession) {
      navigator.mediaSession.setPositionState({
        duration: ~~(this.currentTrack.dt / 1000),
        playbackRate: 1.0,
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
    this.list.append(trackID);
  }
  playNextTrack() {
    // TODO: 切换歌曲时增加加载中的状态
    if (this._playNextList.length > 0) {
      const trackID = this._playNextList.shift();
      this._replaceCurrentTrack(trackID);
      return true;
    }
    const [trackID, index] = this._getSiblingTrack(true);
    if (trackID === undefined) {
      this._audio?.stop();
      this._setPlaying(false);
      return false;
    }
    console.debug(
      `[debug][Player.js] playNextTrack => next:${trackID} from:${formatTrackDebugLabel(this._currentTrack)}`
    );
    this.current = index;
    this._replaceCurrentTrack(trackID);
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
    this._replaceCurrentTrack(
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
    this._audio?.fade(this.volume, 0, PLAY_PAUSE_FADE_DURATION).then(() => {
      this._audio?.pause();
      this._setPlaying(false);
      this._stopProgressLoop();
      setTitle(null);
      this._pauseDiscordPresence(this._currentTrack);
      emitPlayerEvent('playback:pause', { track: this._currentTrack });
    });
  }
  play() {
    if (this._audio?.playing()) return;

    // 播放时确保开启player.
    // 避免因"忘记设置"导致在播放时播放器不显示的Bug
    this._enabled = true;
    this._audio
      ?.play()
      .then(() => this._audio?.fade(0, this.volume, PLAY_PAUSE_FADE_DURATION))
      .then(() => {
        this._setPlaying(true);
        this._startProgressLoop();
        emitPlayerEvent('playback:play', { track: this._currentTrack });
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
        console.error('Failed to play audio', error);
        store.dispatch('showToast', `播放失败`);
      });
  }
  playOrPause() {
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
      if (isCreateMpris && sendMpris) {
        electronPlayer?.seeked(this._progress);
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
    this.list = trackIDs;
    this.current = 0;
    this._playlistSource = {
      type: playlistSourceType,
      id: playlistSourceID,
    };
    if (this.shuffle) this._shuffleTheList(autoPlayTrackID);
    if (autoPlayTrackID === 'first') {
      this._replaceCurrentTrack(this.list[0]);
    } else {
      this.current = this.list.indexOf(autoPlayTrackID);
      this._replaceCurrentTrack(autoPlayTrackID);
    }
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
      this._current = this._list.findIndex(t => t === id);
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
    this._playNextList.push(trackID);
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
    let liked = store.state.liked.songs.includes(this.currentTrack.id);
    electronPlayer?.player({
      playing: this.playing,
      likedCurrentTrack: liked,
    });
    setTrayLikeState(liked);
  }

  switchRepeatMode() {
    if (this._repeatMode === 'on') {
      this.repeatMode = 'one';
    } else if (this._repeatMode === 'one') {
      this.repeatMode = 'off';
    } else {
      this.repeatMode = 'on';
    }
    if (isCreateMpris) {
      electronPlayer?.switchRepeatMode(this.repeatMode);
    }
  }
  switchShuffle() {
    this.shuffle = !this.shuffle;
    if (isCreateMpris) {
      electronPlayer?.switchShuffle(this.shuffle);
    }
  }
  switchReversed() {
    this.reversed = !this.reversed;
  }

  clearPlayNextList() {
    this._playNextList = [];
  }
  removeTrackFromQueue(index) {
    this._playNextList.splice(index, 1);
  }
}

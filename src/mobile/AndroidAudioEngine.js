import { registerPlugin } from '@capacitor/core';
import { normalizePlaybackRate } from '@/utils/playbackRate';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const ERROR_TOAST_DEDUP_MS = 5000;
const LAST_PLAYBACK_ERROR_KEY = 'android-last-playback-error';

const ANDROID_MEDIA_ERROR_MESSAGES = {
  2000: '音频源发生未知 I/O 错误',
  2001: '网络连接失败',
  2002: '网络连接超时',
  2003: '音频服务器返回了错误的内容类型',
  2004: '音频服务器拒绝请求或返回异常 HTTP 状态',
  2005: '音频地址不存在',
  2006: '没有权限读取音频地址',
  2007: 'Android 禁止访问明文 HTTP 音频',
  2008: '音频服务器不支持当前 Range 请求',
  3001: '音频容器格式无法识别',
  3002: '音频容器格式不受支持',
  3003: '音频解析过程发生错误',
  4001: '音频解码器初始化失败',
  4002: '音频解码器查询失败',
  4003: '音频格式超出设备解码能力',
  4004: '设备不支持该音频格式',
  4005: '音频解码失败',
};

function sourceSummary(source) {
  if (!source || typeof source !== 'string') return '';
  try {
    const parsed = new URL(source);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return source.split('?')[0].slice(0, 120);
  }
}

function normalizePlaybackError(error = {}, source = '', token = 0) {
  const nativeCode = Number.isFinite(Number(error.nativeCode))
    ? Number(error.nativeCode)
    : undefined;
  return {
    ...error,
    token: error.token ?? token,
    code: error.code || undefined,
    nativeCode,
    kind: error.kind || 'unknown',
    message:
      error.message ||
      (nativeCode ? ANDROID_MEDIA_ERROR_MESSAGES[nativeCode] : '') ||
      'Android 音频播放失败',
    sourceHost: sourceSummary(error.source || source),
    at: new Date().toISOString(),
  };
}

function formatPlaybackError(error) {
  const reason =
    (error.nativeCode && ANDROID_MEDIA_ERROR_MESSAGES[error.nativeCode]) ||
    error.message ||
    'Android 音频播放失败';
  const code = error.nativeCode ? `Media3 ${error.nativeCode}` : '';
  const source = error.sourceHost || '';
  return [`播放失败：${reason}`, code, source].filter(Boolean).join(' · ');
}

function rememberPlaybackError(error) {
  const diagnostic = {
    at: error.at,
    token: error.token,
    code: error.code,
    nativeCode: error.nativeCode,
    kind: error.kind,
    message: error.message,
    phase: error.phase,
    sourceHost: error.sourceHost,
  };
  globalThis.__yesplaymusicLastPlaybackError__ = diagnostic;
  if (globalThis.yesplaymusic) {
    globalThis.yesplaymusic.lastPlaybackError = diagnostic;
  }
  try {
    localStorage.setItem(LAST_PLAYBACK_ERROR_KEY, JSON.stringify(diagnostic));
  } catch {
    // Diagnostics must never interfere with playback.
  }
  console.error('[android-audio] playback failed', diagnostic);
  return diagnostic;
}

function toNativeTrack(track = {}) {
  const artists = (track.ar || track.artists || [])
    .map(artist => artist?.name)
    .filter(Boolean)
    .join(', ');
  return {
    id: String(track.id || ''),
    title: track.title || track.name || '',
    artist: track.artist || artists,
    album: track.album?.name || track.al?.name || track.album || '',
    artwork: track.artwork || track.al?.picUrl || track.album?.picUrl || '',
    duration: Number(track.duration) || Number(track.dt) / 1000 || 0,
  };
}

const PLUGIN_KEY = '__yesplaymusicBackgroundAudioPlugin__';
export const BackgroundAudio =
  globalThis[PLUGIN_KEY] || registerPlugin('BackgroundAudio');
if (!globalThis[PLUGIN_KEY]) {
  Object.defineProperty(globalThis, PLUGIN_KEY, {
    configurable: true,
    value: BackgroundAudio,
  });
}

/**
 * AudioEngine-compatible facade for the Android Media3 playback service.
 * Player.js can therefore keep its existing synchronous state API while all
 * actual decoding, audio focus and background playback live on the native side.
 */
export default class AndroidAudioEngine {
  constructor({
    onCanPlay,
    onEnded,
    onTimeUpdate,
    onLoadedMetadata,
    onError,
    onPause,
    onPlaying,
    onNext,
    onPrevious,
    onTrackTransition,
  } = {}) {
    this.token = 0;
    this._playing = false;
    this._position = 0;
    this._duration = 0;
    this._volume = 1;
    this._playbackRate = 1;
    this._firstLoad = true;
    this._currentMediaId = '';
    this._currentSource = '';
    this._tracks = new Map();
    this._onTrackTransition = onTrackTransition;
    this._preserveNativePositionOnce = false;
    this._loadFailed = false;
    this._lastErrorToastKey = '';
    this._lastErrorToastAt = 0;
    this._loadPromise = Promise.resolve();
    this._ready = Promise.all([
      BackgroundAudio.addListener('ready', state => {
        if (!this._acceptState(state)) return;
        this._applyState(state);
        onLoadedMetadata?.(this.token);
        onCanPlay?.(this.token);
      }),
      BackgroundAudio.addListener('timeUpdate', state => {
        if (!this._acceptState(state)) return;
        this._applyState(state);
        onTimeUpdate?.(this.token);
      }),
      BackgroundAudio.addListener('stateChanged', state => {
        if (!this._acceptState(state)) return;
        this._applyPlaybackState(state, { onCanPlay, onPause, onPlaying });
      }),
      BackgroundAudio.addListener('ended', state => {
        if (!this._acceptState(state)) return;
        this._applyState(state);
        this._playing = false;
        onEnded?.(this.token);
      }),
      BackgroundAudio.addListener('error', error => {
        if (!this._acceptState(error)) return;
        const normalizedError = normalizePlaybackError(
          error,
          this._currentSource,
          this.token
        );
        rememberPlaybackError(normalizedError);
        this._showPlaybackError(normalizedError);
        onError?.(normalizedError, this.token);
      }),
      BackgroundAudio.addListener('command', command => {
        if (!this._acceptState(command)) return;
        if (command.action === 'next') onNext?.(this.token);
        if (command.action === 'previous') onPrevious?.(this.token);
      }),
      BackgroundAudio.addListener('mediaItemTransition', state => {
        if (!this._acceptState(state)) return;
        this._applyState(state);
        const mediaId = String(state.mediaId || '');
        this._onTrackTransition?.(
          {
            mediaId,
            reason: state.reason || 'playlist',
            source: state.source || '',
            track: this._tracks.get(mediaId),
          },
          this.token
        );
      }),
    ]).then(() =>
      BackgroundAudio.getState()
        .then(state => {
          if (this._acceptState(state)) {
            this._applyPlaybackState(state, {
              onCanPlay,
              onPause,
              onPlaying,
            });
          }
          return state;
        })
        .catch(error => {
          this._reportBridgeFailure(error, 'getState');
          return null;
        })
    );
  }

  load(source, token = this.token + 1, track = {}) {
    const reuseActiveSession = this._firstLoad;
    const reuseIfSame = this._firstLoad;
    this._firstLoad = false;
    this.token = token;
    this._playing = false;
    this._position = 0;
    this._duration = Number(track.duration) || 0;
    this._currentSource = source || '';
    this._loadFailed = false;
    if (track?.id) this._tracks.set(String(track.id), track);
    this._loadPromise = this._ready
      .then(() =>
        BackgroundAudio.load({
          source,
          token,
          track: toNativeTrack(track),
          reuseIfSame,
          reuseActiveSession,
        })
      )
      .then(state => {
        if (this._acceptState(state)) {
          this._preserveNativePositionOnce = state?.reused === true;
          this._applyState(state);
          const mediaId = String(state?.mediaId || '');
          if (
            state?.reused === true &&
            mediaId &&
            mediaId !== String(track?.id || '')
          ) {
            this._onTrackTransition?.(
              {
                mediaId,
                reason: 'resume',
                source: state.source || '',
                track: this._tracks.get(mediaId),
              },
              this.token
            );
          }
        }
        return state;
      })
      .catch(error => {
        this._loadFailed = true;
        this._reportBridgeFailure(error, 'load');
        return null;
      });
    return this._loadPromise;
  }

  play() {
    return this._loadPromise
      .then(() => {
        if (this._loadFailed) return null;
        return BackgroundAudio.play();
      })
      .then(state => {
        if (this._acceptState(state)) this._applyState(state);
        return state;
      })
      .catch(error => {
        this._reportBridgeFailure(error, 'play');
        return null;
      });
  }

  pause() {
    this._playing = false;
    return this._ready.then(() => BackgroundAudio.pause()).catch(() => {});
  }

  stop() {
    this._playing = false;
    this._position = 0;
    return this._ready.then(() => BackgroundAudio.stop()).catch(() => {});
  }

  cacheSource(source, track = {}) {
    if (!source || !track?.id) return Promise.resolve(null);
    return this._ready
      .then(() =>
        BackgroundAudio.cache({
          source,
          cacheKey: `track:${track.id}`,
        })
      )
      .catch(error => {
        console.debug('[android-audio-cache] prefetch failed', error);
        return null;
      });
  }

  queueNextSource(source, track = {}) {
    if (!source || !track?.id) return Promise.resolve(null);
    this._tracks.set(String(track.id), track);
    return this._loadPromise
      .then(() =>
        BackgroundAudio.queueNext({
          source,
          track: toNativeTrack(track),
        })
      )
      .catch(error => {
        console.debug('[android-audio-queue] queue next failed', error);
        return null;
      });
  }

  clearNextSource() {
    return this._loadPromise
      .then(() => BackgroundAudio.clearNext())
      .catch(() => null);
  }

  playing() {
    return this._playing;
  }

  seek(time) {
    if (time !== undefined && time !== null) {
      const max = this._duration > 0 ? this._duration : Number(time) || 0;
      const position = clamp(Number(time) || 0, 0, max);
      this._loadPromise
        .then(() => {
          if (this._preserveNativePositionOnce) {
            this._preserveNativePositionOnce = false;
            return null;
          }
          this._position = position;
          return BackgroundAudio.seek({ position });
        })
        .catch(() => {});
    }
    return this.currentTime();
  }

  currentTime() {
    return this._position;
  }

  duration() {
    return this._duration;
  }

  volume(value) {
    if (value !== undefined) {
      this._volume = clamp(Number(value) || 0, 0, 1);
      this._ready
        .then(() => BackgroundAudio.setVolume({ value: this._volume }))
        .catch(() => {});
    }
    return this._volume;
  }

  playbackRate(value) {
    if (value !== undefined) {
      this._playbackRate = normalizePlaybackRate(value);
      this._ready
        .then(() =>
          BackgroundAudio.setPlaybackRate({ value: this._playbackRate })
        )
        .catch(() => {});
    }
    return this._playbackRate;
  }

  async fade(from, to, duration = 0) {
    this.volume(from);
    if (duration <= 0) {
      this.volume(to);
      return;
    }
    const start = performance.now();
    await new Promise(resolve => {
      const step = now => {
        const progress = clamp((now - start) / duration, 0, 1);
        this.volume(from + (to - from) * progress);
        if (progress >= 1) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  setOutputDevice() {
    // Android routes audio through the system-selected output device.
  }

  _showPlaybackError(error) {
    // Player.js already shows a dedicated unsupported-format message.
    if (error.code === 4) return;
    const message = formatPlaybackError(error);
    const key = `${error.token}:${error.nativeCode || error.kind}:${error.sourceHost}`;
    const now = Date.now();
    if (
      key === this._lastErrorToastKey &&
      now - this._lastErrorToastAt < ERROR_TOAST_DEDUP_MS
    ) {
      return;
    }
    this._lastErrorToastKey = key;
    this._lastErrorToastAt = now;
    globalThis?.yesplaymusicStore?.dispatch?.('showToast', message);
  }

  _reportBridgeFailure(error, phase) {
    const normalizedError = normalizePlaybackError(
      {
        kind: 'bridge',
        phase,
        message: error?.message || String(error || 'Unknown Android bridge error'),
      },
      this._currentSource,
      this.token
    );
    rememberPlaybackError(normalizedError);
    this._showPlaybackError(normalizedError);
  }

  _acceptState(state) {
    return state?.token === undefined || state.token === this.token;
  }

  _applyState(state) {
    if (typeof state?.playing === 'boolean') this._playing = state.playing;
    if (Number.isFinite(state?.position)) this._position = state.position;
    if (Number.isFinite(state?.duration) && state.duration > 0) {
      this._duration = state.duration;
    }
    if (Number.isFinite(state?.volume)) this._volume = state.volume;
    if (Number.isFinite(state?.playbackRate)) {
      this._playbackRate = normalizePlaybackRate(state.playbackRate);
    }
    if (state?.mediaId !== undefined) {
      this._currentMediaId = String(state.mediaId || '');
    }
    if (state?.source) this._currentSource = state.source;
  }

  _applyPlaybackState(state, { onCanPlay, onPause, onPlaying }) {
    const wasPlaying = this._playing;
    this._applyState(state);
    if (this._playing && !wasPlaying) {
      onCanPlay?.(this.token);
      onPlaying?.(this.token);
    } else if (!this._playing && wasPlaying) {
      onPause?.(this.token);
    }
  }
}

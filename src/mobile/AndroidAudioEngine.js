import { registerPlugin } from '@capacitor/core';
import { normalizePlaybackRate } from '@/utils/playbackRate';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

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
        onError?.(
          {
            ...error,
            code: error.code || undefined,
          },
          this.token
        );
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
        .catch(() => null)
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
      });
    return this._loadPromise;
  }

  play() {
    return this._loadPromise
      .then(() => BackgroundAudio.play())
      .then(state => {
        if (this._acceptState(state)) this._applyState(state);
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

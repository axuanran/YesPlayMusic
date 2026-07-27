import { normalizePlaybackRate } from '@/utils/playbackRate';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default class AudioEngine {
  constructor({
    onCanPlay,
    onEnded,
    onTimeUpdate,
    onLoadedMetadata,
    onError,
    onPause,
    onPlaying,
    onStalled,
    onWaiting,
  } = {}) {
    this.token = 0;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.crossOrigin = 'anonymous';
    this.audio.addEventListener('ended', () => onEnded?.(this.token));
    this.audio.addEventListener('timeupdate', () => onTimeUpdate?.(this.token));
    this.audio.addEventListener('loadedmetadata', () =>
      onLoadedMetadata?.(this.token)
    );
    this.audio.addEventListener('durationchange', () =>
      onLoadedMetadata?.(this.token)
    );
    this.audio.addEventListener('canplay', () => onCanPlay?.(this.token));
    this.audio.addEventListener('playing', () => {
      onCanPlay?.(this.token);
      onPlaying?.(this.token);
    });
    this.audio.addEventListener('pause', () => onPause?.(this.token));
    this.audio.addEventListener('stalled', () => onStalled?.(this.token));
    this.audio.addEventListener('waiting', () => onWaiting?.(this.token));
    this.audio.addEventListener('error', () =>
      onError?.(this.audio.error, this.token)
    );
  }

  load(source, token = this.token + 1) {
    this.token = token;
    this.audio.pause();
    this.audio.src = this._rewriteOuterUrl(source);
    this.audio.load();
  }

  /**
   * Rewrite music.163.com outer URLs to the same-origin proxy path to avoid
   * browser CORS blocking in dev, Docker, and LAN deployments.
   */
  _rewriteOuterUrl(url) {
    if (typeof url !== 'string') return url;
    const match = url.match(
      /^https:\/\/music\.163\.com\/song\/media\/outer\/url\?id=(\d+)/
    );
    if (!match) return url;
    return '/__audio_proxy/' + match[1];
  }

  play() {
    return this.audio.play();
  }

  pause() {
    this.audio.pause();
  }

  stop() {
    this.pause();
    this.seek(0);
  }

  playing() {
    return !this.audio.paused && !this.audio.ended;
  }

  seek(time) {
    if (time !== undefined && time !== null) {
      const duration = this.duration();
      const max = Number.isFinite(duration) && duration > 0 ? duration : time;
      this.audio.currentTime = clamp(Number(time) || 0, 0, max);
    }
    return this.currentTime();
  }

  currentTime() {
    return Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
  }

  duration() {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  volume(value) {
    if (value !== undefined) {
      this.audio.volume = clamp(Number(value) || 0, 0, 1);
    }
    return this.audio.volume;
  }

  playbackRate(value) {
    if (value !== undefined) {
      this.audio.playbackRate = normalizePlaybackRate(value);
    }
    return this.audio.playbackRate;
  }

  async fade(from, to, duration = 0) {
    this.volume(from);
    if (duration <= 0) {
      this.volume(to);
      return;
    }

    const start = performance.now();
    await new Promise(resolve => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        this.volume(to);
        resolve();
      };
      const step = now => {
        if (finished) return;
        const progress = clamp((now - start) / duration, 0, 1);
        this.volume(from + (to - from) * progress);
        if (progress >= 1) {
          finish();
          return;
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      setTimeout(finish, duration + 100);
    });
  }

  setOutputDevice(deviceId) {
    if (!this.audio.setSinkId || !deviceId) return;
    this.audio.setSinkId(deviceId).catch(err => {
      console.warn('Failed to set audio output device', err);
    });
  }
}

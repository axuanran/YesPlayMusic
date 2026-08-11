import MprisPlayer from '@jellybrick/mpris-service';
import { app, ipcMain } from 'electron';
import { showMainWindow } from './showMainWindow.js';

export const MPRIS_UPDATE_CHANNEL = 'mpris:update';
export const MPRIS_COMMAND_CHANNEL = 'mpris:command';

const MICROSECONDS_PER_SECOND = 1_000_000;
const LOOP_STATUS_FROM_RENDERER = {
  off: 'None',
  on: 'Playlist',
  one: 'Track',
};
const LOOP_STATUS_TO_RENDERER = {
  None: 'off',
  Playlist: 'on',
  Track: 'one',
};

const isFiniteNumber = value =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const sanitizeTrackId = trackId => {
  const value = String(trackId ?? 'unknown').replace(/[^A-Za-z0-9_]/g, '_');
  return value || 'unknown';
};

const normalizeArtists = artists => {
  if (Array.isArray(artists)) {
    return artists.filter(artist => typeof artist === 'string' && artist);
  }
  if (typeof artists === 'string' && artists) return [artists];
  return [];
};

export class MprisService {
  constructor(window, options = {}) {
    this.window = window;
    this.ipc = options.ipc || ipcMain;
    this.application = options.application || app;
    const Player = options.Player || MprisPlayer;

    this.positionSeconds = 0;
    this.positionUpdatedAt = Date.now();
    this.durationSeconds = 0;
    this.trackPath = null;
    this.pendingLyrics = null;
    this.stopped = false;
    this.disposed = false;
    this.playerHandlers = [];

    this.player = new Player({
      name: 'yesplaymusic',
      identity: 'YesPlayMusic',
      desktopEntry: 'yesplaymusic',
      supportedInterfaces: ['player'],
      supportedMimeTypes: [],
      supportedUriSchemes: [],
      canQuit: true,
      canRaise: true,
    });

    this.player.getPosition = () =>
      Math.round(this.getPositionSeconds() * MICROSECONDS_PER_SECOND);
    this.player.minimumRate = 0.5;
    this.player.maximumRate = 2;
    this.player.rate = 1;

    this.handleUpdate = (_event, state) => this.update(state);
    this.ipc.on(MPRIS_UPDATE_CHANNEL, this.handleUpdate);
    this.registerPlayerEvents();
  }

  onPlayer(event, handler) {
    this.player.on(event, handler);
    this.playerHandlers.push([event, handler]);
  }

  registerPlayerEvents() {
    const sendType = type => () => this.sendCommand({ type });

    this.onPlayer('play', sendType('play'));
    this.onPlayer('pause', sendType('pause'));
    this.onPlayer('playpause', sendType('playPause'));
    this.onPlayer('stop', sendType('stop'));
    this.onPlayer('next', sendType('next'));
    this.onPlayer('previous', sendType('previous'));
    this.onPlayer('seek', offset => {
      if (!isFiniteNumber(offset)) return;
      this.sendCommand({
        offset: offset / MICROSECONDS_PER_SECOND,
        type: 'seek',
      });
    });
    this.onPlayer('position', ({ position, trackId } = {}) => {
      if (!isFiniteNumber(position)) return;
      if (trackId && this.trackPath && trackId !== this.trackPath) return;
      this.sendCommand({
        position: position / MICROSECONDS_PER_SECOND,
        type: 'setPosition',
      });
    });
    this.onPlayer('loopStatus', loopStatus => {
      const mode = LOOP_STATUS_TO_RENDERER[loopStatus];
      if (mode) this.sendCommand({ mode, type: 'setLoopStatus' });
    });
    this.onPlayer('shuffle', enabled => {
      if (typeof enabled === 'boolean') {
        this.sendCommand({ enabled, type: 'setShuffle' });
      }
    });
    this.onPlayer('volume', volume => {
      if (isFiniteNumber(volume)) {
        this.sendCommand({
          type: 'setVolume',
          volume: clamp(volume, 0, 1),
        });
      }
    });
    this.onPlayer('rate', rate => {
      if (isFiniteNumber(rate)) {
        this.sendCommand({
          rate: clamp(rate, this.player.minimumRate, this.player.maximumRate),
          type: 'setRate',
        });
      }
    });
    this.onPlayer('raise', () => this.raiseWindow());
    this.onPlayer('quit', () => this.application.quit());
    this.onPlayer('error', error => {
      console.warn(`[mpris] ${error?.message || error}`);
    });
  }

  sendCommand(command) {
    if (
      this.disposed ||
      this.window?.isDestroyed?.() ||
      this.window?.webContents?.isDestroyed?.()
    ) {
      return;
    }
    this.window?.webContents?.send(MPRIS_COMMAND_CHANNEL, command);
  }

  raiseWindow() {
    showMainWindow(this.window);
  }

  getPositionSeconds() {
    let position = this.positionSeconds;
    if (this.player.playbackStatus === 'Playing') {
      position += (Date.now() - this.positionUpdatedAt) / 1000;
    }
    if (this.durationSeconds > 0) {
      position = Math.min(position, this.durationSeconds);
    }
    return Math.max(0, position);
  }

  update(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return;

    if (state.metadata) this.updateMetadata(state.metadata);
    if (state.lyrics) this.updateLyrics(state.lyrics);

    const hasPosition = isFiniteNumber(state.position) && state.position >= 0;
    if (hasPosition) {
      this.positionSeconds = state.position;
      this.positionUpdatedAt = Date.now();
    }

    if (typeof state.playing === 'boolean') {
      if (!hasPosition) this.positionSeconds = this.getPositionSeconds();
      this.positionUpdatedAt = Date.now();
      if (state.playing) this.stopped = false;
      if (state.stopped === true) this.stopped = true;
      this.player.playbackStatus = this.stopped
        ? 'Stopped'
        : state.playing
          ? 'Playing'
          : 'Paused';
    }

    const loopStatus = LOOP_STATUS_FROM_RENDERER[state.loopStatus];
    if (loopStatus) this.player.loopStatus = loopStatus;
    if (typeof state.shuffle === 'boolean') this.player.shuffle = state.shuffle;
    if (isFiniteNumber(state.rate)) {
      this.player.rate = clamp(
        state.rate,
        this.player.minimumRate,
        this.player.maximumRate
      );
    }
    if (isFiniteNumber(state.volume)) {
      this.player.volume = clamp(state.volume, 0, 1);
    }

    if (hasPosition && state.seeked === true) {
      this.player.seeked?.(
        Math.round(this.positionSeconds * MICROSECONDS_PER_SECOND)
      );
    }
  }

  updateMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return;

    const duration = isFiniteNumber(metadata.length)
      ? Math.max(0, metadata.length)
      : 0;
    this.durationSeconds = duration;
    this.positionSeconds = 0;
    this.positionUpdatedAt = Date.now();

    this.trackPath = this.player.objectPath(
      `track/${sanitizeTrackId(metadata.trackId)}`
    );
    const nextMetadata = {
      'mpris:trackid': this.trackPath,
      'mpris:length': Math.round(duration * MICROSECONDS_PER_SECOND),
      'xesam:title': String(metadata.title || ''),
      'xesam:album': String(metadata.album || ''),
      'xesam:artist': normalizeArtists(metadata.artist),
      'xesam:url': String(metadata.url || ''),
    };

    const artwork = Array.isArray(metadata.artwork)
      ? metadata.artwork.at(-1)?.src
      : metadata.artwork;
    if (typeof artwork === 'string' && artwork) {
      nextMetadata['mpris:artUrl'] = artwork;
    }
    if (typeof metadata.asText === 'string' && metadata.asText) {
      nextMetadata['xesam:asText'] = metadata.asText;
    }

    this.player.metadata = nextMetadata;
    if (this.pendingLyrics) {
      const pendingLyrics = this.pendingLyrics;
      this.pendingLyrics = null;
      this.updateLyrics(pendingLyrics);
    }
  }

  updateLyrics(lyrics) {
    if (!lyrics || typeof lyrics !== 'object') return;

    const trackPath = this.player.objectPath(
      `track/${sanitizeTrackId(lyrics.trackId)}`
    );
    if (!this.trackPath) {
      this.pendingLyrics = lyrics;
      return;
    }
    if (trackPath !== this.trackPath) return;

    const nextMetadata = { ...this.player.metadata };
    if (typeof lyrics.text === 'string' && lyrics.text) {
      nextMetadata['xesam:asText'] = lyrics.text;
    } else {
      delete nextMetadata['xesam:asText'];
    }
    this.player.metadata = nextMetadata;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ipc.removeListener(MPRIS_UPDATE_CHANNEL, this.handleUpdate);
    for (const [event, handler] of this.playerHandlers) {
      this.player.removeListener?.(event, handler);
    }
    this.playerHandlers = [];
    this.pendingLyrics = null;
  }
}

export function createMpris(window, options) {
  return new MprisService(window, options);
}

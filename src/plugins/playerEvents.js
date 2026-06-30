import { pluginEvents } from './events';
import { createPluginLogger } from './logger';

const logger = createPluginLogger('player-events');

export const PLAYER_EVENTS = {
  TRACK_CHANGE: 'track:change',
  AUDIO_LOADED: 'audio:loaded',
  AUDIO_ERROR: 'audio:error',
  PLAYBACK_PLAY: 'playback:play',
  PLAYBACK_PAUSE: 'playback:pause',
};

function normalizeError(error) {
  if (!error) return undefined;
  return {
    name: error.name,
    message: error.message || String(error),
    code: error.code,
  };
}

export function createPlayerEventPayload(payload = {}) {
  const track = payload.track;
  return {
    ...payload,
    trackId: payload.trackId ?? track?.id,
    error: normalizeError(payload.error),
    at: Date.now(),
  };
}

export function emitPlayerEvent(event, payload) {
  try {
    pluginEvents.emit(event, createPlayerEventPayload(payload));
  } catch (error) {
    logger.warn(`player event failed: ${event}`, error);
  }
}

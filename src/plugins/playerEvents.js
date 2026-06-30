import { pluginEvents } from './events';
import { AUDIO_PROVIDER_EVENTS, PLAYER_EVENTS } from './eventsCatalog';
import { createPluginLogger } from './logger';

const logger = createPluginLogger('player-events');

export { PLAYER_EVENTS };
export { AUDIO_PROVIDER_EVENTS };

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

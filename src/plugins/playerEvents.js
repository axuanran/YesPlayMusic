import { pluginEvents } from './events';

export const PLAYER_EVENTS = {
  TRACK_CHANGE: 'track:change',
  AUDIO_LOADED: 'audio:loaded',
  AUDIO_ERROR: 'audio:error',
  PLAYBACK_PLAY: 'playback:play',
  PLAYBACK_PAUSE: 'playback:pause',
};

export function emitPlayerEvent(event, payload) {
  try {
    pluginEvents.emit(event, payload);
  } catch (error) {
    console.warn(`[plugins] player event failed: ${event}`, error);
  }
}

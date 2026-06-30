import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emit: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../events', () => ({
  pluginEvents: {
    emit: mocks.emit,
  },
}));

vi.mock('../logger', () => ({
  createPluginLogger: () => ({
    debug: vi.fn(),
    warn: mocks.warn,
    error: vi.fn(),
  }),
}));

import {
  AUDIO_PROVIDER_EVENTS,
  createPlayerEventPayload,
  emitPlayerEvent,
  PLAYER_EVENTS,
} from '../playerEvents';
import { AUDIO_PROVIDER_EVENTS as CATALOG_AUDIO_PROVIDER_EVENTS } from '../eventsCatalog';

describe('player events', () => {
  beforeEach(() => {
    mocks.emit.mockReset();
    mocks.warn.mockReset();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
  });

  it('adds trackId and timestamp to payload', () => {
    expect(
      createPlayerEventPayload({
        track: { id: 123, name: 'Track' },
      })
    ).toMatchObject({
      trackId: 123,
      at: 1000,
    });
  });

  it('exports shared audio provider event names', () => {
    expect(AUDIO_PROVIDER_EVENTS).toBe(CATALOG_AUDIO_PROVIDER_EVENTS);
  });

  it('normalizes errors', () => {
    const error = new Error('boom');
    error.code = 4;

    expect(createPlayerEventPayload({ error }).error).toEqual({
      name: 'Error',
      message: 'boom',
      code: 4,
    });
  });

  it('emits normalized payload', () => {
    emitPlayerEvent(PLAYER_EVENTS.TRACK_CHANGE, {
      track: { id: 1 },
    });

    expect(mocks.emit).toHaveBeenCalledWith(
      PLAYER_EVENTS.TRACK_CHANGE,
      expect.objectContaining({
        trackId: 1,
        at: 1000,
      })
    );
  });

  it('logs and swallows emit failures', () => {
    mocks.emit.mockImplementationOnce(() => {
      throw new Error('emit failed');
    });

    expect(() => emitPlayerEvent(PLAYER_EVENTS.TRACK_CHANGE, {})).not.toThrow();
    expect(mocks.warn).toHaveBeenCalledWith(
      `player event failed: ${PLAYER_EVENTS.TRACK_CHANGE}`,
      expect.any(Error)
    );
  });
});

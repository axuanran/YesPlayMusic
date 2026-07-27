import { describe, expect, it } from 'vitest';
import {
  canPublishDiscordPresence,
  getDiscordStatus,
  getDiscordProgressTimestamps,
  shouldShowDiscordStatus,
} from '../discordPresence.js';

describe('Discord presence', () => {
  it('shows status only when connected and enabled', () => {
    expect(shouldShowDiscordStatus(true, true)).toBe(true);
    expect(shouldShowDiscordStatus(true, false)).toBe(false);
    expect(shouldShowDiscordStatus(false, true)).toBe(false);
  });

  it('reports enabled and connection state independently', () => {
    expect(getDiscordStatus(false, true)).toEqual({
      connected: false,
      enabled: true,
    });
    expect(getDiscordStatus(true, false)).toEqual({
      connected: true,
      enabled: false,
    });
  });

  it('does not publish while Discord is disconnected or disabled', () => {
    expect(canPublishDiscordPresence(false, true)).toBe(false);
    expect(canPublishDiscordPresence(true, false)).toBe(false);
    expect(canPublishDiscordPresence(true, true)).toBe(true);
  });

  it('maps playback progress to activity timestamps', () => {
    expect(
      getDiscordProgressTimestamps({
        durationMs: 180_000,
        now: 1_000_000,
        positionSeconds: 30,
      })
    ).toEqual({
      endTimestamp: 1_150_000,
      startTimestamp: 970_000,
    });
  });

  it('accounts for playback speed', () => {
    expect(
      getDiscordProgressTimestamps({
        durationMs: 180_000,
        now: 1_000_000,
        playbackRate: 2,
        positionSeconds: 30,
      })
    ).toEqual({
      endTimestamp: 1_075_000,
      startTimestamp: 985_000,
    });
  });
});

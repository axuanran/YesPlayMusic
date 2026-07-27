import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  normalizePlaybackRate,
  PLAYBACK_RATES,
} from '../playbackRate.js';

describe('playback rate', () => {
  it('provides ordered standard rate options', () => {
    expect(PLAYBACK_RATES).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
  });

  it('clamps rates to the supported range', () => {
    expect(normalizePlaybackRate(0.1)).toBe(MIN_PLAYBACK_RATE);
    expect(normalizePlaybackRate(1.25)).toBe(1.25);
    expect(normalizePlaybackRate(3)).toBe(MAX_PLAYBACK_RATE);
  });

  it('falls back to the normal rate for invalid values', () => {
    expect(normalizePlaybackRate('invalid')).toBe(1);
  });
});

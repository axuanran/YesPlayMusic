import { describe, expect, it } from 'vitest';
import { getWheelAdjustedVolume, VOLUME_WHEEL_STEP } from '@/utils/volume';

describe('getWheelAdjustedVolume', () => {
  it('increases volume when scrolling up', () => {
    expect(getWheelAdjustedVolume(0.5, -100)).toBe(0.5 + VOLUME_WHEEL_STEP);
  });

  it('decreases volume when scrolling down', () => {
    expect(getWheelAdjustedVolume(0.5, 100)).toBe(0.5 - VOLUME_WHEEL_STEP);
  });

  it('clamps volume to the supported range', () => {
    expect(getWheelAdjustedVolume(0.98, -1)).toBe(1);
    expect(getWheelAdjustedVolume(0.02, 1)).toBe(0);
  });

  it('ignores invalid or empty wheel movement', () => {
    expect(getWheelAdjustedVolume(0.4, 0)).toBe(0.4);
    expect(getWheelAdjustedVolume(0.4, Number.NaN)).toBe(0.4);
  });
});

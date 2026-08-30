import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_LYRICS_SETTINGS,
  mergeDesktopLyricsSettings,
  normalizeDesktopLyricsSettings,
} from '../desktopLyricsSettings.js';

describe('desktop lyrics settings', () => {
  it('starts disabled, locked, and fully transparent', () => {
    expect(normalizeDesktopLyricsSettings()).toMatchObject({
      backgroundOpacity: 0,
      enabled: false,
      locked: true,
      overflowMode: 'ellipsis',
      positionPreset: 'custom',
      visible: false,
    });
  });

  it('migrates the legacy enabled switch', () => {
    expect(normalizeDesktopLyricsSettings(undefined, true)).toMatchObject({
      enabled: true,
      visible: true,
    });
  });

  it('bounds numbers and rejects unsafe enum and color values', () => {
    const value = normalizeDesktopLyricsSettings({
      backgroundOpacity: 8,
      fontSize: 1000,
      secondaryFontSize: 1,
      textAlign: 'justify',
      overflowMode: 'scroll',
      positionPreset: 'center',
      textColor: 'red',
      x: '',
    });

    expect(value).toMatchObject({
      backgroundOpacity: 1,
      fontSize: 72,
      secondaryFontSize: 12,
      textAlign: DEFAULT_DESKTOP_LYRICS_SETTINGS.textAlign,
      overflowMode: DEFAULT_DESKTOP_LYRICS_SETTINGS.overflowMode,
      positionPreset: DEFAULT_DESKTOP_LYRICS_SETTINGS.positionPreset,
      textColor: DEFAULT_DESKTOP_LYRICS_SETTINGS.textColor,
      x: null,
    });
  });

  it('accepts supported overflow and position modes', () => {
    expect(
      normalizeDesktopLyricsSettings({
        overflowMode: 'wrap',
        positionPreset: 'top-right',
      })
    ).toMatchObject({
      overflowMode: 'wrap',
      positionPreset: 'top-right',
    });
  });

  it('merges a partial update without losing saved values', () => {
    expect(
      mergeDesktopLyricsSettings(
        { enabled: true, fontSize: 48, visible: true },
        { locked: false }
      )
    ).toMatchObject({
      enabled: true,
      fontSize: 48,
      locked: false,
      visible: true,
    });
  });
});

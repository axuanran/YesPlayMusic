import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_LYRICS_SETTINGS,
  mergeDesktopLyricsSettings,
  normalizeDesktopLyricsSettings,
} from '../desktopLyricsSettings.js';

describe('desktop lyrics settings', () => {
  it('starts enabled, locked, and fully transparent', () => {
    expect(normalizeDesktopLyricsSettings()).toMatchObject({
      backgroundOpacity: 0,
      enabled: true,
      locked: true,
      visible: true,
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
      textColor: 'red',
      x: '',
    });

    expect(value).toMatchObject({
      backgroundOpacity: 1,
      fontSize: 72,
      secondaryFontSize: 12,
      textAlign: DEFAULT_DESKTOP_LYRICS_SETTINGS.textAlign,
      textColor: DEFAULT_DESKTOP_LYRICS_SETTINGS.textColor,
      x: null,
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

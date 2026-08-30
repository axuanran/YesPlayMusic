import { describe, expect, it } from 'vitest';
import {
  BUILTIN_DESKTOP_LYRICS_STYLE_TEMPLATES,
  DEFAULT_DESKTOP_LYRICS_SETTINGS,
  getDesktopLyricsStyle,
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
      verticalPosition: 'center',
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
      verticalPosition: 'middle',
      textColor: 'red',
      x: '',
    });

    expect(value).toMatchObject({
      backgroundOpacity: 1,
      fontSize: 72,
      secondaryFontSize: 12,
      textAlign: DEFAULT_DESKTOP_LYRICS_SETTINGS.textAlign,
      overflowMode: DEFAULT_DESKTOP_LYRICS_SETTINGS.overflowMode,
      verticalPosition: DEFAULT_DESKTOP_LYRICS_SETTINGS.verticalPosition,
      textColor: DEFAULT_DESKTOP_LYRICS_SETTINGS.textColor,
      x: null,
    });
  });

  it('accepts supported overflow and vertical position modes', () => {
    expect(
      normalizeDesktopLyricsSettings({
        overflowMode: 'wrap',
        verticalPosition: 'top',
      })
    ).toMatchObject({
      overflowMode: 'wrap',
      verticalPosition: 'top',
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
  it('provides multiple normalized built-in style templates', () => {
    expect(BUILTIN_DESKTOP_LYRICS_STYLE_TEMPLATES).toHaveLength(4);
    expect(
      BUILTIN_DESKTOP_LYRICS_STYLE_TEMPLATES.map(template => template.id)
    ).toEqual(['classic', 'karaoke', 'subtitle', 'minimal']);
    for (const template of BUILTIN_DESKTOP_LYRICS_STYLE_TEMPLATES) {
      expect(getDesktopLyricsStyle(template.style)).toEqual(template.style);
    }
  });

  it('normalizes and preserves valid custom style templates', () => {
    const settings = normalizeDesktopLyricsSettings({
      styleTemplates: [
        {
          id: 'my-style',
          name: 'My Style',
          style: {
            fontSize: 48,
            overflowMode: 'wrap',
            textColor: '#abcdef',
            verticalPosition: 'bottom',
          },
        },
        {
          id: 'my-style',
          name: 'Duplicate',
          style: {},
        },
        {
          id: 'unsafe id',
          name: 'Invalid',
          style: {},
        },
      ],
    });

    expect(settings.styleTemplates).toEqual([
      {
        id: 'my-style',
        name: 'My Style',
        style: expect.objectContaining({
          fontSize: 48,
          overflowMode: 'wrap',
          textColor: '#abcdef',
          verticalPosition: 'bottom',
        }),
      },
    ]);
  });
});

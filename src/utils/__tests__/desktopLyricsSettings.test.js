import { describe, expect, it } from 'vitest';
import {
  BUILTIN_DESKTOP_LYRICS_STYLE_TEMPLATES,
  DEFAULT_DESKTOP_LYRICS_SETTINGS,
  DESKTOP_LYRICS_STYLE_KEYS,
  estimateDesktopLyricsHeight,
  getDesktopLyricsStyle,
  mergeDesktopLyricsSettings,
  normalizeDesktopLyricsSettings,
  parseDesktopLyricsStyle,
  serializeDesktopLyricsStyle,
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

  it('defaults to single-line mode and clamps the visible line count', () => {
    expect(normalizeDesktopLyricsSettings()).toMatchObject({
      lineCount: DEFAULT_DESKTOP_LYRICS_SETTINGS.lineCount,
    });
    expect(normalizeDesktopLyricsSettings({ lineCount: 0 }).lineCount).toBe(1);
    expect(normalizeDesktopLyricsSettings({ lineCount: 99 }).lineCount).toBe(9);
    expect(normalizeDesktopLyricsSettings({ lineCount: 5 }).lineCount).toBe(5);
    expect(
      normalizeDesktopLyricsSettings({ lineCount: 'invalid' }).lineCount
    ).toBe(DEFAULT_DESKTOP_LYRICS_SETTINGS.lineCount);
  });

  it('estimates the height needed for the configured line count', () => {
    const single = estimateDesktopLyricsHeight({ lineCount: 1 });
    const multi = estimateDesktopLyricsHeight({ lineCount: 3 });
    const withoutSecondary = estimateDesktopLyricsHeight({
      lineCount: 3,
      showSecondary: false,
    });

    expect(single).toBeGreaterThan(92);
    expect(multi).toBeGreaterThan(single);
    expect(withoutSecondary).toBeLessThan(multi);
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

  it('round-trips a style through export and import', () => {
    const settings = normalizeDesktopLyricsSettings({
      fontSize: 48,
      secondaryFontSize: 20,
      textAlign: 'left',
      overflowMode: 'wrap',
      verticalPosition: 'bottom',
      textColor: '#ffcc00',
      secondaryColor: '#00ffcc',
      backgroundOpacity: 0.6,
      showSecondary: false,
    });
    const json = serializeDesktopLyricsStyle(settings);
    const parsed = JSON.parse(json);

    expect(parsed).toMatchObject({
      app: 'YesPlayMusic',
      type: 'desktop-lyrics-style',
      version: 1,
    });
    expect(Object.keys(parsed.style).sort()).toEqual(
      [...DESKTOP_LYRICS_STYLE_KEYS].sort()
    );
    expect(parseDesktopLyricsStyle(json)).toEqual(
      getDesktopLyricsStyle(settings)
    );
  });

  it('imports a bare style object without export metadata', () => {
    const style = parseDesktopLyricsStyle(
      JSON.stringify({ fontSize: 56, textColor: '#123456' })
    );
    expect(style).toMatchObject({
      fontSize: 56,
      textColor: '#123456',
      textAlign: DEFAULT_DESKTOP_LYRICS_SETTINGS.textAlign,
    });
  });

  it('rejects invalid style files on import', () => {
    expect(parseDesktopLyricsStyle('not json')).toBeNull();
    expect(parseDesktopLyricsStyle('null')).toBeNull();
    expect(parseDesktopLyricsStyle('[1,2,3]')).toBeNull();
    expect(parseDesktopLyricsStyle('{"foo": 1}')).toBeNull();
    expect(
      parseDesktopLyricsStyle(JSON.stringify({ type: 'desktop-lyrics-style' }))
    ).toBeNull();
  });

  it('normalizes unsafe values from an imported style file', () => {
    const style = parseDesktopLyricsStyle(
      JSON.stringify({
        fontSize: 1000,
        textAlign: 'justify',
        textColor: 'red',
        backgroundOpacity: 8,
      })
    );
    expect(style).toMatchObject({
      fontSize: 72,
      textAlign: DEFAULT_DESKTOP_LYRICS_SETTINGS.textAlign,
      textColor: DEFAULT_DESKTOP_LYRICS_SETTINGS.textColor,
      backgroundOpacity: 1,
    });
  });
});

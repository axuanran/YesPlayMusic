import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMenuIconFileName, resolveTrayIconTheme } from '../trayIconTheme.js';

describe('tray icon theme', () => {
  it('uses light glyphs on a dark automatic theme', () => {
    expect(resolveTrayIconTheme('auto', true)).toBe('light');
    expect(getMenuIconFileName('play', true)).toBe('play-dark.png');
  });

  it('uses original menu icons on a light theme', () => {
    expect(resolveTrayIconTheme('auto', false)).toBe('dark');
    expect(getMenuIconFileName('play', false)).toBe('play.png');
  });

  it('respects an explicit tray icon color', () => {
    expect(resolveTrayIconTheme('light', false)).toBe('light');
    expect(resolveTrayIconTheme('dark', true)).toBe('dark');
  });

  it('rejects unknown menu icon names', () => {
    expect(() => getMenuIconFileName('../unknown', true)).toThrow(
      'Unsupported tray menu icon'
    );
  });

  it('ships every dark-theme menu icon asset', () => {
    const names = [
      'play',
      'pause',
      'left',
      'right',
      'repeat',
      'like',
      'unlike',
      'exit',
    ];

    names.forEach(name => {
      const iconUrl = new URL(
        `../../../public/img/icons/${name}-dark.png`,
        import.meta.url
      );
      expect(existsSync(iconUrl), `${name} dark icon is missing`).toBe(true);
    });
  });
});

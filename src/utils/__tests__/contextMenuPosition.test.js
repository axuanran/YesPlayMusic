import { describe, expect, it } from 'vitest';
import { getContextMenuLayout } from '@/utils/contextMenuPosition';

describe('getContextMenuLayout', () => {
  it('moves a bottom-right menu fully inside the visible area', () => {
    expect(
      getContextMenuLayout({
        bottomInset: 64,
        menuHeight: 300,
        menuWidth: 220,
        topInset: 64,
        viewportHeight: 800,
        viewportWidth: 1200,
        x: 1190,
        y: 790,
      })
    ).toEqual({
      left: 972,
      maxHeight: 656,
      maxWidth: 1184,
      top: 428,
    });
  });

  it('constrains an oversized menu and keeps its origin visible', () => {
    expect(
      getContextMenuLayout({
        bottomInset: 64,
        menuHeight: 1200,
        menuWidth: 900,
        topInset: 64,
        viewportHeight: 480,
        viewportWidth: 640,
        x: -100,
        y: -100,
      })
    ).toEqual({
      left: 8,
      maxHeight: 336,
      maxWidth: 624,
      top: 72,
    });
  });

  it('accounts for a visual viewport offset', () => {
    expect(
      getContextMenuLayout({
        bottomInset: 40,
        menuHeight: 300,
        menuWidth: 220,
        topInset: 50,
        viewportHeight: 600,
        viewportLeft: 25,
        viewportTop: 100,
        viewportWidth: 900,
        x: 900,
        y: 680,
      })
    ).toEqual({
      left: 697,
      maxHeight: 494,
      maxWidth: 884,
      top: 352,
    });
  });
});

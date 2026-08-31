import { describe, expect, it } from 'vitest';

import {
  isInteractiveKeyboardTarget,
  shouldHandlePlaybackSpace,
} from '../keyboardShortcuts';

const event = overrides => ({
  altKey: false,
  code: 'Space',
  ctrlKey: false,
  defaultPrevented: false,
  metaKey: false,
  repeat: false,
  shiftKey: false,
  target: { closest: () => null },
  ...overrides,
});

describe('keyboard shortcuts', () => {
  it('handles one unmodified Space press on page content', () => {
    expect(shouldHandlePlaybackSpace(event(), 'home')).toBe(true);
  });

  it('ignores repeated, modified, prevented, and MV Space presses', () => {
    expect(shouldHandlePlaybackSpace(event({ repeat: true }), 'home')).toBe(
      false
    );
    expect(shouldHandlePlaybackSpace(event({ ctrlKey: true }), 'home')).toBe(
      false
    );
    expect(
      shouldHandlePlaybackSpace(event({ defaultPrevented: true }), 'home')
    ).toBe(false);
    expect(shouldHandlePlaybackSpace(event(), 'mv')).toBe(false);
  });

  it('ignores controls and editable targets', () => {
    const target = { closest: selector => selector.includes('button') };
    expect(shouldHandlePlaybackSpace(event({ target }), 'home')).toBe(false);
    expect(isInteractiveKeyboardTarget({ isContentEditable: true })).toBe(true);
  });
});

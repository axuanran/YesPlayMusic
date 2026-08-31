import { describe, expect, it } from 'vitest';

import { getContextMenuTargetIndex } from '../contextMenuKeyboard';

describe('getContextMenuTargetIndex', () => {
  it('wraps arrow navigation in both directions', () => {
    expect(getContextMenuTargetIndex('ArrowDown', 2, 3)).toBe(0);
    expect(getContextMenuTargetIndex('ArrowUp', 0, 3)).toBe(2);
  });

  it('selects the first item for down and last item for up initially', () => {
    expect(getContextMenuTargetIndex('ArrowDown', -1, 3)).toBe(0);
    expect(getContextMenuTargetIndex('ArrowUp', -1, 3)).toBe(2);
  });

  it('supports Home and End and ignores unrelated keys', () => {
    expect(getContextMenuTargetIndex('Home', 1, 3)).toBe(0);
    expect(getContextMenuTargetIndex('End', 1, 3)).toBe(2);
    expect(getContextMenuTargetIndex('Enter', 1, 3)).toBeNull();
    expect(getContextMenuTargetIndex('ArrowDown', 0, 0)).toBeNull();
  });
});

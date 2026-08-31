import { describe, expect, it, vi } from 'vitest';

import { getModalFocusableElements, trapModalTab } from '../modalFocus';

function createElement() {
  return {
    focus: vi.fn(),
    getAttribute: vi.fn(() => null),
    hidden: false,
  };
}

describe('modal focus management', () => {
  it('filters hidden and aria-hidden controls', () => {
    const visible = createElement();
    const hidden = { ...createElement(), hidden: true };
    const ariaHidden = createElement();
    ariaHidden.getAttribute.mockReturnValue('true');
    const container = {
      querySelectorAll: vi.fn(() => [visible, hidden, ariaHidden]),
    };

    expect(getModalFocusableElements(container)).toEqual([visible]);
  });

  it('wraps Tab from the last control to the first', () => {
    const first = createElement();
    const last = createElement();
    const container = {
      contains: vi.fn(() => true),
      querySelectorAll: vi.fn(() => [first, last]),
    };
    const event = { key: 'Tab', preventDefault: vi.fn(), shiftKey: false };

    expect(trapModalTab(event, container, last)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    const first = createElement();
    const last = createElement();
    const container = {
      contains: vi.fn(() => true),
      querySelectorAll: vi.fn(() => [first, last]),
    };
    const event = { key: 'Tab', preventDefault: vi.fn(), shiftKey: true };

    expect(trapModalTab(event, container, first)).toBe(true);
    expect(last.focus).toHaveBeenCalledOnce();
  });
});

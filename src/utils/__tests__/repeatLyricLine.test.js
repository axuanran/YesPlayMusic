import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearRepeatLyricLineDriver,
  getRepeatLyricIndex,
  onRepeatLyricIndexChange,
  registerRepeatLyricLineDriver,
  setRepeatLyricIndex,
  toggleRepeatLyricLine,
} from '../repeatLyricLine.js';

describe('repeatLyricLine shared state', () => {
  beforeEach(() => {
    setRepeatLyricIndex(-1);
    clearRepeatLyricLineDriver();
  });

  it('normalizes invalid indexes to -1', () => {
    setRepeatLyricIndex(3);
    expect(getRepeatLyricIndex()).toBe(3);
    setRepeatLyricIndex(-2);
    expect(getRepeatLyricIndex()).toBe(-1);
    setRepeatLyricIndex('nope');
    expect(getRepeatLyricIndex()).toBe(-1);
  });

  it('notifies listeners only when the value actually changes', () => {
    const listener = vi.fn();
    const remove = onRepeatLyricIndexChange(listener);

    setRepeatLyricIndex(2);
    setRepeatLyricIndex(2);
    setRepeatLyricIndex(-1);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, 2);
    expect(listener).toHaveBeenNthCalledWith(2, -1);

    remove();
    setRepeatLyricIndex(4);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('delegates toggles to the registered driver', () => {
    const toggle = vi.fn();
    registerRepeatLyricLineDriver({ toggle });

    expect(toggleRepeatLyricLine()).toBe(true);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('reports a no-op when no driver is registered', () => {
    expect(toggleRepeatLyricLine()).toBe(false);
  });

  it('only clears the driver that matches the registered one', () => {
    const driver = { toggle: vi.fn() };
    const other = { toggle: vi.fn() };
    registerRepeatLyricLineDriver(driver);

    clearRepeatLyricLineDriver(other);
    expect(toggleRepeatLyricLine()).toBe(true);

    clearRepeatLyricLineDriver(driver);
    expect(toggleRepeatLyricLine()).toBe(false);
  });
});

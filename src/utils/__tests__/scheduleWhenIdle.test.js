import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scheduleWhenIdle } from '../scheduleWhenIdle';

describe('scheduleWhenIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses requestIdleCallback with a timeout when available', () => {
    const requestIdleCallback = vi.fn(() => 7);
    vi.stubGlobal('requestIdleCallback', requestIdleCallback);
    const callback = vi.fn();

    scheduleWhenIdle(callback, { timeout: 3000 });

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 3000,
    });
    requestIdleCallback.mock.calls[0][0]();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('falls back to a delayed timer and can be canceled', () => {
    const callback = vi.fn();
    const cancel = scheduleWhenIdle(callback, { fallbackDelay: 2000 });

    vi.advanceTimersByTime(1999);
    expect(callback).not.toHaveBeenCalled();
    cancel();
    vi.runAllTimers();

    expect(callback).not.toHaveBeenCalled();
  });
});

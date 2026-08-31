import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scheduleAfterFirstPaint } from '../afterFirstPaint';

describe('scheduleAfterFirstPaint', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('defers startup work until the frame after first paint', () => {
    let paintCallback;
    vi.stubGlobal('requestAnimationFrame', callback => {
      paintCallback = callback;
      return 1;
    });
    const callback = vi.fn();

    scheduleAfterFirstPaint(callback);
    expect(callback).not.toHaveBeenCalled();

    paintCallback();
    vi.runAllTimers();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('cancels deferred work during teardown', () => {
    let paintCallback;
    vi.stubGlobal('requestAnimationFrame', callback => {
      paintCallback = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const callback = vi.fn();

    const cancel = scheduleAfterFirstPaint(callback);
    cancel();
    paintCallback();
    vi.runAllTimers();

    expect(callback).not.toHaveBeenCalled();
  });
});

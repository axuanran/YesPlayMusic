import { describe, expect, it, vi } from 'vitest';
import {
  getPerformanceMode,
  shouldUseWindowShadow,
  updateWindowShadow,
} from '../windowAppearance.js';

describe('window appearance', () => {
  it('migrates the legacy low-performance setting', () => {
    expect(getPerformanceMode({ lowPerformanceMode: false })).toBe('off');
    expect(getPerformanceMode({ lowPerformanceMode: true })).toBe('balanced');
  });

  it('uses shadows only for normal mode on Windows', () => {
    expect(shouldUseWindowShadow({ performanceMode: 'off' }, 'win32')).toBe(
      true
    );
    expect(
      shouldUseWindowShadow({ performanceMode: 'balanced' }, 'win32')
    ).toBe(false);
    expect(
      shouldUseWindowShadow({ performanceMode: 'aggressive' }, 'win32')
    ).toBe(false);
    expect(shouldUseWindowShadow({ performanceMode: 'off' }, 'linux')).toBe(
      false
    );
  });

  it('updates a live Windows window', () => {
    const win = {
      isDestroyed: vi.fn(() => false),
      setHasShadow: vi.fn(),
    };

    expect(updateWindowShadow(win, { performanceMode: 'off' }, 'win32')).toBe(
      true
    );
    expect(win.setHasShadow).toHaveBeenLastCalledWith(true);

    expect(
      updateWindowShadow(win, { performanceMode: 'balanced' }, 'win32')
    ).toBe(false);
    expect(win.setHasShadow).toHaveBeenLastCalledWith(false);
  });

  it('does not touch destroyed or non-Windows windows', () => {
    const win = {
      isDestroyed: vi.fn(() => true),
      setHasShadow: vi.fn(),
    };

    expect(updateWindowShadow(win, {}, 'win32')).toBe(false);
    expect(updateWindowShadow(win, {}, 'linux')).toBe(false);
    expect(win.setHasShadow).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import {
  INITIAL_RENDER_BATCH,
  RENDER_BATCH_STEP,
  initialRenderLimit,
  nextRenderLimit,
  isFullyRendered,
  ensureIndexRendered,
} from '@/utils/incrementalRender';

describe('incrementalRender', () => {
  describe('initialRenderLimit', () => {
    it('caps the first batch at the list length for short lists', () => {
      expect(initialRenderLimit(10)).toBe(10);
      expect(initialRenderLimit(0)).toBe(0);
    });

    it('uses the full batch for long lists', () => {
      expect(initialRenderLimit(1000)).toBe(INITIAL_RENDER_BATCH);
    });
  });

  describe('nextRenderLimit', () => {
    it('grows by one step', () => {
      expect(nextRenderLimit(50, 1000)).toBe(50 + RENDER_BATCH_STEP);
    });

    it('never exceeds the list length', () => {
      expect(nextRenderLimit(950, 1000)).toBe(1000);
      expect(nextRenderLimit(1000, 1000)).toBe(1000);
    });

    it('converges to total after a finite number of steps', () => {
      const total = 1234;
      let limit = initialRenderLimit(total);
      let steps = 0;
      while (!isFullyRendered(limit, total)) {
        limit = nextRenderLimit(limit, total);
        steps += 1;
        if (steps > 100) throw new Error('did not converge');
      }
      expect(limit).toBe(total);
    });
  });

  describe('isFullyRendered', () => {
    it('is true only once the limit reaches the total', () => {
      expect(isFullyRendered(49, 50)).toBe(false);
      expect(isFullyRendered(50, 50)).toBe(true);
      expect(isFullyRendered(60, 50)).toBe(true);
    });
  });

  describe('ensureIndexRendered', () => {
    it('expands to include a late index', () => {
      expect(ensureIndexRendered(50, 300, 1000)).toBe(301);
    });

    it('never shrinks an already larger limit', () => {
      expect(ensureIndexRendered(500, 10, 1000)).toBe(500);
    });

    it('caps at the list length and ignores a missing index', () => {
      expect(ensureIndexRendered(50, 2000, 1000)).toBe(1000);
      expect(ensureIndexRendered(50, -1, 1000)).toBe(50);
    });
  });
});

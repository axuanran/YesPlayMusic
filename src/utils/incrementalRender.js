// Pure helpers for incremental list rendering (see components/TrackList.vue).
// A long list mounts a first batch for a fast first paint, then grows the
// rendered slice on idle until the whole list is in the DOM. Keeping the math
// here makes it unit-testable without a component harness.

export const INITIAL_RENDER_BATCH = 50;
export const RENDER_BATCH_STEP = 100;

// The slice size to start a (possibly new) list with, never exceeding its
// length.
export function initialRenderLimit(total, batch = INITIAL_RENDER_BATCH) {
  return Math.min(Math.max(0, batch), Math.max(0, total));
}

// The next slice size after growing by one step, capped at the list length.
export function nextRenderLimit(current, total, step = RENDER_BATCH_STEP) {
  return Math.min(current + Math.max(1, step), Math.max(0, total));
}

// Whether every item is already rendered.
export function isFullyRendered(current, total) {
  return current >= total;
}

// Expand a limit so a specific index is included (for scroll-to-track), never
// shrinking it and never exceeding the list length.
export function ensureIndexRendered(current, index, total) {
  if (index < 0) return current;
  return Math.min(Math.max(current, index + 1), Math.max(0, total));
}

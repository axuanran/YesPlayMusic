// Shared state for the "repeat lyric line" (单句循环) feature.
// The toggle must be reachable from three places: the full lyrics page
// (lyrics.vue, which owns the parsed lyric and drives the seek), the desktop
// lyrics window (a separate renderer that forwards a command over IPC), and
// the global/local shortcut handlers. This module is the single source of
// truth in the main renderer; lyrics.vue registers itself as the "driver"
// because only it knows the current lyric, the active line and how to seek.

const listeners = new Set();
let repeatLyricIndex = -1;
let driver = null;

export function getRepeatLyricIndex() {
  return repeatLyricIndex;
}

export function setRepeatLyricIndex(index) {
  const next = Number.isInteger(index) && index >= 0 ? index : -1;
  if (next === repeatLyricIndex) return;
  repeatLyricIndex = next;
  listeners.forEach(listener => listener(repeatLyricIndex));
}

export function onRepeatLyricIndexChange(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function registerRepeatLyricLineDriver(nextDriver) {
  driver = nextDriver;
}

export function clearRepeatLyricLineDriver(currentDriver) {
  if (!currentDriver || driver === currentDriver) driver = null;
}

// Returns false when nobody can handle the toggle right now (lyrics.vue is
// not mounted), so callers can tell a no-op apart from a real toggle.
export function toggleRepeatLyricLine() {
  if (typeof driver?.toggle !== 'function') return false;
  driver.toggle();
  return true;
}

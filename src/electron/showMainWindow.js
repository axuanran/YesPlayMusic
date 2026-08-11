const WAKE_RENDERER_DURATION = 300;
const throttleRestoreTimers = new WeakMap();

function wakeRenderer(win) {
  const contents = win.webContents;
  if (!contents || contents.isDestroyed?.()) return;

  contents.invalidate?.();

  const previousTimer = throttleRestoreTimers.get(win);
  if (previousTimer) clearTimeout(previousTimer);
  const wasThrottled =
    previousTimer !== undefined || contents.getBackgroundThrottling?.();
  if (wasThrottled !== true || !contents.setBackgroundThrottling) return;

  contents.setBackgroundThrottling(false);
  const timer = setTimeout(() => {
    throttleRestoreTimers.delete(win);
    if (win.isDestroyed?.() || contents.isDestroyed?.()) return;
    contents.setBackgroundThrottling(true);
  }, WAKE_RENDERER_DURATION);
  timer.unref?.();
  throttleRestoreTimers.set(win, timer);
}

export function showMainWindow(win) {
  if (!win || win.isDestroyed?.()) return;

  const wasInBackground =
    win.isMinimized?.() === true || win.isVisible?.() === false;
  if (win.isMinimized?.()) {
    win.restore();
  }
  win.show();
  if (wasInBackground) wakeRenderer(win);
  win.focus();
}

export function showMainWindow(win) {
  if (!win || win.isDestroyed?.()) return;

  if (win.isMinimized?.()) {
    win.restore();
  }
  win.show();
  win.focus();
}

export function getPerformanceMode(settings = {}) {
  if (['off', 'balanced', 'aggressive'].includes(settings.performanceMode)) {
    return settings.performanceMode;
  }
  return settings.lowPerformanceMode ? 'balanced' : 'off';
}

export function shouldUseWindowShadow(
  settings = {},
  platform = process.platform
) {
  return platform === 'win32' && getPerformanceMode(settings) === 'off';
}

export function updateWindowShadow(win, settings, platform = process.platform) {
  if (
    platform !== 'win32' ||
    !win ||
    win.isDestroyed?.() ||
    typeof win.setHasShadow !== 'function'
  ) {
    return false;
  }

  const hasShadow = shouldUseWindowShadow(settings, platform);
  win.setHasShadow(hasShadow);
  return hasShadow;
}

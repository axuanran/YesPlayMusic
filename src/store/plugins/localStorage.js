const SETTINGS_MUTATIONS = new Set([
  'changeLang',
  'changeMusicQuality',
  'changeLyricFontSize',
  'changeOutputDevice',
  'updateSettings',
  'togglePlaylistCategory',
  'updateShortcut',
  'restoreDefaultShortcuts',
]);

const scheduleAfterPaint = callback => {
  if (
    typeof requestAnimationFrame === 'function' &&
    typeof document !== 'undefined' &&
    document.visibilityState !== 'hidden'
  ) {
    requestAnimationFrame(() => setTimeout(callback, 0));
    return;
  }
  setTimeout(callback, 0);
};

export default store => {
  let pendingSettings = false;
  let pendingData = false;
  let flushScheduled = false;
  let latestState = store.state;

  const flush = () => {
    flushScheduled = false;
    if (pendingSettings) {
      pendingSettings = false;
      localStorage.setItem('settings', JSON.stringify(latestState.settings));
    }
    if (pendingData) {
      pendingData = false;
      localStorage.setItem('data', JSON.stringify(latestState.data));
    }
  };

  store.subscribe((mutation, state) => {
    latestState = state;
    if (SETTINGS_MUTATIONS.has(mutation.type)) {
      pendingSettings = true;
    }
    if (mutation.type === 'updateData') {
      pendingData = true;
    }
    if ((!pendingSettings && !pendingData) || flushScheduled) return;
    flushScheduled = true;
    scheduleAfterPaint(flush);
  });
};

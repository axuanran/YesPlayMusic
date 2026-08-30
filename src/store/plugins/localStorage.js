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
  let persistenceErrorNotified = false;

  const flush = () => {
    flushScheduled = false;
    let attempted = false;
    let succeeded = true;
    const persist = (key, value) => {
      attempted = true;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        succeeded = false;
        console.error(`Failed to persist ${key}`, error);
        if (!persistenceErrorNotified) {
          persistenceErrorNotified = true;
          store.dispatch?.(
            'showToast',
            '本地数据保存失败，当前更改已生效，但下次启动可能无法保留'
          );
        }
      }
    };

    if (pendingSettings) {
      pendingSettings = false;
      persist('settings', latestState.settings);
    }
    if (pendingData) {
      pendingData = false;
      persist('data', latestState.data);
    }
    if (attempted && succeeded) persistenceErrorNotified = false;
  };
  const flushWhenHidden = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', flushWhenHidden);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener?.('beforeunload', flush);
  }

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

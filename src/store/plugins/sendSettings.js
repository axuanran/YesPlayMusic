import cloneDeep from 'lodash/cloneDeep';

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

export function getSendSettingsPlugin() {
  return store => {
    const changedKeys = new Set();
    let latestSettings = null;
    let flushScheduled = false;
    let persistenceErrorNotified = false;

    const flush = () => {
      flushScheduled = false;
      const settings = latestSettings;
      latestSettings = null;
      if (!settings || changedKeys.size === 0) return;

      const patch = {};
      for (const key of changedKeys) {
        patch[key] = cloneDeep(settings[key]);
      }
      changedKeys.clear();
      const updateSettings = window.electronAPI?.settings?.updateSettings;
      if (typeof updateSettings !== 'function') return;
      try {
        updateSettings(patch);
        persistenceErrorNotified = false;
      } catch (error) {
        console.error('Failed to persist Electron settings', error);
        if (!persistenceErrorNotified) {
          persistenceErrorNotified = true;
          store.dispatch?.(
            'showToast',
            '设置同步失败，当前更改已生效，但下次启动可能无法保留'
          );
        }
      }
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
      if (mutation.type !== 'updateSettings') return;
      const key = mutation.payload?.key;
      if (typeof key !== 'string' || key.length === 0) return;
      changedKeys.add(key);
      if (key === 'useAudioResolver') changedKeys.add('plugins');
      latestSettings = state.settings;
      if (flushScheduled) return;
      flushScheduled = true;
      scheduleAfterPaint(flush);
    });
  };
}

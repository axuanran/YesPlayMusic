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
      if (typeof updateSettings === 'function') {
        updateSettings(patch);
      }
    };

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

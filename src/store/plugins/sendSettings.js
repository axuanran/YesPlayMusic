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
    let latestSettings = null;
    let flushScheduled = false;

    const flush = () => {
      flushScheduled = false;
      const settings = latestSettings;
      latestSettings = null;
      const updateSettings = window.electronAPI?.settings?.updateSettings;
      if (typeof updateSettings === 'function' && settings) {
        updateSettings(cloneDeep(settings));
      }
    };

    store.subscribe((mutation, state) => {
      if (mutation.type !== 'updateSettings') return;
      latestSettings = state.settings;
      if (flushScheduled) return;
      flushScheduled = true;
      scheduleAfterPaint(flush);
    });
  };
}

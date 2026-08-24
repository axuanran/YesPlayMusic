export function getSendSettingsPlugin() {
  return store => {
    store.subscribe(mutation => {
      if (mutation.type !== 'updateSettings') return;
      const { key, value } = mutation.payload || {};
      if (typeof key !== 'string' || key.length === 0) return;
      window.electronAPI?.settings?.updateSetting?.({ key, value });
    });
  };
}

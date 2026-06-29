import cloneDeep from 'lodash/cloneDeep';

export function getSendSettingsPlugin() {
  return store => {
    store.subscribe((mutation, state) => {
      // console.log(mutation);
      if (mutation.type !== 'updateSettings') return;
      window.electronAPI?.settings?.updateSettings?.(cloneDeep(state.settings));
    });
  };
}

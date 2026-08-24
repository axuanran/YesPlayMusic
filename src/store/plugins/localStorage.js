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

export default store => {
  store.subscribe((mutation, state) => {
    if (SETTINGS_MUTATIONS.has(mutation.type)) {
      localStorage.setItem('settings', JSON.stringify(state.settings));
    }
    if (mutation.type === 'updateData') {
      localStorage.setItem('data', JSON.stringify(state.data));
    }
  });
};

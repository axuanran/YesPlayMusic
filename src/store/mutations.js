import shortcuts, { normalizeShortcuts } from '@/utils/shortcuts';
import cloneDeep from 'lodash/cloneDeep';
import {
  recordClientPlayback,
  saveClientPlaybackHistory,
} from '@/utils/clientPlaybackHistory';

export default {
  updateLikedXXX(state, { name, data }) {
    state.liked[name] = data;
    if (name === 'songs') {
      state.player.sendSelfToIpcMain();
    }
  },
  recordClientPlayback(state, payload) {
    state.clientPlaybackHistory = recordClientPlayback(
      state.clientPlaybackHistory,
      payload
    );
    saveClientPlaybackHistory(state.clientPlaybackHistory);
  },
  changeLang(state, lang) {
    state.settings.lang = lang;
  },
  changeMusicQuality(state, value) {
    state.settings.musicQuality = value;
  },
  changeLyricFontSize(state, value) {
    state.settings.lyricFontSize = value;
  },
  changeOutputDevice(state, deviceId) {
    state.settings.outputDevice = deviceId;
  },
  updateSettings(state, { key, value }) {
    state.settings[key] = value;
    if (key === 'useAudioResolver') {
      state.settings.plugins = {
        ...(state.settings.plugins || {}),
        'resolver-admin': {
          ...(state.settings.plugins?.['resolver-admin'] || {}),
          enabled: value === true,
        },
      };
    }
  },
  updateData(state, { key, value }) {
    state.data[key] = value;
  },
  togglePlaylistCategory(state, name) {
    const index = state.settings.enabledPlaylistCategories.findIndex(
      c => c === name
    );
    if (index !== -1) {
      state.settings.enabledPlaylistCategories =
        state.settings.enabledPlaylistCategories.filter(c => c !== name);
    } else {
      state.settings.enabledPlaylistCategories.push(name);
    }
  },
  updateToast(state, toast) {
    state.toast = toast;
  },
  updateModal(state, { modalName, key, value }) {
    state.modals[modalName][key] = value;
    if (key === 'show') {
      // 100ms的延迟是为等待右键菜单blur之后再disableScrolling
      value === true
        ? setTimeout(() => (state.enableScrolling = false), 100)
        : (state.enableScrolling = true);
    }
  },
  toggleLyrics(state) {
    state.showLyrics = !state.showLyrics;
  },
  updateDailyTracks(state, dailyTracks) {
    state.dailyTracks = dailyTracks;
  },
  updateLastfm(state, session) {
    state.lastfm = session;
  },
  updateShortcut(state, { accelerator, enabled, id, scope }) {
    const normalized = normalizeShortcuts(state.settings.shortcuts);
    const target = normalized.find(shortcut => shortcut.id === id);
    if (!target || !['local', 'global'].includes(scope)) return;
    if (typeof accelerator === 'string') {
      target[scope].accelerator = accelerator;
    }
    if (typeof enabled === 'boolean') {
      target[scope].enabled = enabled;
    }
    state.settings.shortcuts = normalized;
  },
  restoreDefaultShortcuts(state) {
    state.settings.shortcuts = cloneDeep(shortcuts);
  },
  enableScrolling(state, status = null) {
    state.enableScrolling = status ? status : !state.enableScrolling;
  },
  updateTitle(state, title) {
    state.title = title;
  },
  bumpPlayerVersion(state) {
    state.playerVersion += 1;
  },
  bumpPlayerProgressVersion(state) {
    state.playerProgressVersion += 1;
  },
  bumpPlayerTrackVersion(state) {
    state.playerTrackVersion += 1;
  },
};

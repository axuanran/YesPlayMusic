import { createStore } from 'vuex';
import state from './state';
import mutations from './mutations';
import actions from './actions';
import { changeAppearance, changeThemeColor } from '@/utils/common';
import Player from '@/utils/Player';
import { isElectron } from '@/utils/env';
import { getCookie } from '@/utils/auth';
// vuex 自定义插件
import saveToLocalStorage from './plugins/localStorage';
import { getSendSettingsPlugin } from './plugins/sendSettings';

const PROGRESS_UI_INTERVAL = 1000;
const PROGRESS_IMMEDIATE_DELTA = 0.9;

function ensureProgressPatchState(player) {
  if (!Object.prototype.hasOwnProperty.call(player, '_lastProgressUiSyncAt')) {
    Object.defineProperty(player, '_lastProgressUiSyncAt', {
      value: 0,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }
}

function installPlayerPerformancePatch() {
  Player.prototype._syncProgress = function (force = false) {
    if (!this._audio) return;

    ensureProgressPatchState(this);

    const now = Date.now();
    const duration = this.currentTrackDuration;
    const nextProgress = Math.min(this._audio.currentTime(), duration);
    const progressDelta = Math.abs(nextProgress - (this._progress || 0));

    if (
      !force &&
      progressDelta < PROGRESS_IMMEDIATE_DELTA &&
      now - this._lastProgressUiSyncAt < PROGRESS_UI_INTERVAL
    ) {
      return;
    }

    this._lastProgressUiSyncAt = now;
    this._progress = nextProgress;

    if (this._progressSyncTimer === null) {
      this._progressSyncTimer = setTimeout(() => {
        this._progressSyncTimer = null;
        localStorage.setItem('playerCurrentTrackTime', this._progress);
      }, PROGRESS_UI_INTERVAL);
    }

    this._schedulePersist();
  };

  Player.prototype._startProgressLoop = function () {
    if (this._progressFrame !== null) return;

    this._progressFrame = setInterval(() => {
      const player = this._getReactiveSelf();
      if (!player.playing) {
        player._stopProgressLoop();
        return;
      }
      player._syncProgress();
    }, PROGRESS_UI_INTERVAL);
  };

  Player.prototype._stopProgressLoop = function () {
    if (this._progressFrame === null) return;
    clearInterval(this._progressFrame);
    this._progressFrame = null;
  };
}

installPlayerPerformancePatch();

let plugins = [saveToLocalStorage];
if (isElectron) {
  let sendSettings = getSendSettingsPlugin();
  plugins.push(sendSettings);
}
const options = {
  state,
  mutations,
  actions,
  plugins,
};

const store = createStore(options);

// Restore loginMode from cookie on page load.
// loginMode is null by default, so after refresh the app appears logged out
// even when MUSIC_U cookie still exists.
if (getCookie('MUSIC_U') && !store.state.data.loginMode) {
  store.commit('updateData', { key: 'loginMode', value: 'account' });
}

if ([undefined, null].includes(store.state.settings.lang)) {
  const defaultLang = 'en';
  const langMapper = new Map()
    .set('zh', 'zh-CN')
    .set('zh-TW', 'zh-TW')
    .set('en', 'en')
    .set('tr', 'tr');
  store.state.settings.lang =
    langMapper.get(
      langMapper.has(navigator.language)
        ? navigator.language
        : navigator.language.slice(0, 2)
    ) || defaultLang;
  localStorage.setItem('settings', JSON.stringify(store.state.settings));
}

changeAppearance(store.state.settings.appearance);
changeThemeColor(store.state.settings.themeColor);

window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => {
    if (store.state.settings.appearance === 'auto') {
      changeAppearance(store.state.settings.appearance);
      changeThemeColor(store.state.settings.themeColor);
    }
  });

let player = new Player();
// Proxy 仅用于 Vue 响应式，持久化由 Player 各 setter 显式调用 persist()
player = new Proxy(player, {
  set(target, prop, val) {
    target[prop] = val;
    return true;
  },
});
player.bindReactiveSelf(player);
store.state.player = player;
globalThis.yesplaymusicStore = store;

export default store;
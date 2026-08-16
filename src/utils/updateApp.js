import initLocalStorage from '@/store/initLocalStorage.js';
import { isElectron } from '@/utils/env';
import { normalizeShortcuts } from '@/utils/shortcuts';
import { normalizeDesktopLyricsSettings } from '@/utils/desktopLyricsSettings';
import { applyPluginSettingLinks } from '@/plugins/settings';
import pkg from '../../package.json';

const updateSetting = () => {
  const parsedSettings = JSON.parse(localStorage.getItem('settings'));
  let settings = {
    ...initLocalStorage.settings,
    ...parsedSettings,
  };

  if (
    parsedSettings?.enableDesktopLyrics === undefined &&
    parsedSettings?.enableOsdlyricsSupport === true
  ) {
    settings.enableDesktopLyrics = true;
  }
  settings.desktopLyrics = normalizeDesktopLyricsSettings(
    parsedSettings?.desktopLyrics,
    settings.enableDesktopLyrics
  );

  // Older desktop builds pointed directly at the resolver port. The desktop
  // renderer and resolver now share an origin and the same prefix as Docker.
  if (
    isElectron &&
    /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]):27232\/?$/i.test(
      settings.audioResolverUrl || ''
    )
  ) {
    settings.audioResolverUrl = initLocalStorage.settings.audioResolverUrl;
  }

  settings.shortcuts = normalizeShortcuts(settings.shortcuts);

  if (localStorage.getItem('appVersion') === '"0.3.9"') {
    settings.lyricsBackground = true;
  }

  settings = applyPluginSettingLinks(settings);
  localStorage.setItem('settings', JSON.stringify(settings));
};

const updateData = () => {
  const parsedData = JSON.parse(localStorage.getItem('data'));
  const data = {
    ...parsedData,
  };
  localStorage.setItem('data', JSON.stringify(data));
};

const updatePlayer = () => {
  let parsedData = JSON.parse(localStorage.getItem('player'));
  let appVersion = localStorage.getItem('appVersion');
  if (appVersion === `"0.2.5"`) parsedData = {}; // 0.2.6版本重构了player
  const data = {
    ...parsedData,
  };
  localStorage.setItem('player', JSON.stringify(data));
};

const removeOldStuff = () => {
  // remove old indexedDB databases created by localforage
  indexedDB.deleteDatabase('tracks');
};

export default function () {
  updateSetting();
  updateData();
  updatePlayer();
  removeOldStuff();
  localStorage.setItem('appVersion', JSON.stringify(pkg.version));
}

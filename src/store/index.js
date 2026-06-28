import { createStore } from "vuex";
import state from "./state";
import mutations from "./mutations";
import actions from "./actions";
import { changeAppearance, changeThemeColor } from "@/utils/common";
import Player from "@/utils/Player";
import { isElectron } from "@/utils/env";
import { getCookie } from "@/utils/auth";
// vuex 自定义插件
import saveToLocalStorage from "./plugins/localStorage";
import { getSendSettingsPlugin } from "./plugins/sendSettings";

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
  const defaultLang = "en";
  const langMapper = new Map()
    .set("zh", "zh-CN")
    .set("zh-TW", "zh-TW")
    .set("en", "en")
    .set("tr", "tr");
  store.state.settings.lang =
    langMapper.get(
      langMapper.has(navigator.language)
        ? navigator.language
        : navigator.language.slice(0, 2)
    ) || defaultLang;
  localStorage.setItem("settings", JSON.stringify(store.state.settings));
}

changeAppearance(store.state.settings.appearance);
changeThemeColor(store.state.settings.themeColor);

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (store.state.settings.appearance === "auto") {
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

export default store;

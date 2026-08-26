import { createApp } from 'vue';
import VueGtag from 'vue-gtag-next';
import App from './App.vue';
import router from './router';
import store from './store';
import i18n from '@/locale';
import icons from '@/assets/icons';
import filters from '@/utils/filters';
import './registerServiceWorker';
import { dailyTask } from '@/utils/common';
import { installDevErrorReporter } from '@/utils/devErrorReporter';
import { hydrateCookiesToDocument } from '@/utils/auth';
import { createPluginContext, installPlugins } from '@/plugins';
import '@/assets/css/global.scss';
import '@/assets/css/mobile.scss';
import '@/assets/css/mobile-adaptive.scss';
import '@/assets/css/mobile-touch.scss';
import '@/assets/css/mobile-lyrics-player.scss';
import NProgress from 'nprogress';
import '@/assets/css/nprogress.css';
import { setupMobileShell } from '@/mobile/setupMobileShell';

window.resetApp = () => {
  localStorage.clear();
  indexedDB.deleteDatabase('yesplaymusic');
  document.cookie.split(';').forEach(function (c) {
    document.cookie = c
      .replace(/^ +/, '')
      .replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
  });
  return '已重置应用，请刷新页面（按Ctrl/Command + R）';
};
console.log(
  '如出现问题，可尝试在本页输入 %cresetApp()%c 然后按回车重置应用。',
  'background: #eaeffd;color:#335eea;padding: 4px 6px;border-radius:3px;',
  'background:unset;color:unset;'
);

NProgress.configure({ showSpinner: false, trickleSpeed: 100 });
installDevErrorReporter();
hydrateCookiesToDocument();

dailyTask();

const app = createApp(App);

app.use(store);
app.use(router);
app.use(i18n);
app.use(icons);
app.use(filters);
app.use(VueGtag, {
  config: { id: 'G-KMJJCFZDKF' },
  router,
});

const pluginContext = createPluginContext({ router, store });
window.yesplaymusicPluginContext = pluginContext;
installPlugins(pluginContext);

app.mount('#app');

router
  .isReady()
  .then(() => setupMobileShell(router))
  .catch(error =>
    console.error('[mobile] Failed to set up shell', error)
  );
import { playlistCategories } from '@/utils/staticData';
import shortcuts from '@/utils/shortcuts';
import { isElectron } from '@/utils/env';

const enabledPlaylistCategories = playlistCategories
  .filter(c => c.enable)
  .map(c => c.name);

let localStorage = {
  player: {},
  settings: {
    lang: null,
    musicLanguage: 'all',
    appearance: 'auto',
    themeColor: 'default',
    musicQuality: 'exhigh',
    lyricFontSize: 28,
    outputDevice: 'default',
    showPlaylistsByAppleMusic: true,
    enableUnblockNeteaseMusic: true,
    automaticallyCacheSongs: true,
    cacheLimit: 8192,
    enableReversedMode: false,
    nyancatStyle: false,
    showLyricsTranslation: true,
    lyricsBackground: true,
    enableOsdlyricsSupport: false,
    closeAppOption: 'ask',
    enableDiscordRichPresence: false,
    enableGlobalShortcut: true,
    showLibraryDefault: false,
    subTitleDefault: false,
    linuxEnableCustomTitlebar: false,
    trayIconTheme: 'auto',
    enabledPlaylistCategories,
    proxyConfig: {
      protocol: 'noProxy',
      server: '',
      port: null,
    },
    enableRealIP: false,
    realIP: null,
    useAudioResolver: false,
    audioResolverUrl: 'http://127.0.0.1:27232',
    shortcuts: shortcuts,
  },
   data: {
     user: {},
     likedSongPlaylistID: 0,
     lastRefreshCookieTime: 0,
     loginMode: null,
   },
};

if (isElectron) {
  localStorage.settings.automaticallyCacheSongs = true;
}

export default localStorage;

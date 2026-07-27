import { playlistCategories } from '@/utils/staticData';
import shortcuts from '@/utils/shortcuts';
import { isElectron } from '@/utils/env';
import { getCurrentPageResolverURL } from '@/api/audioResolver';
import { DEFAULT_DESKTOP_LYRICS_SETTINGS } from '@/utils/desktopLyricsSettings';

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
    automaticallyCacheSongs: true,
    cacheLimit: 8192,
    enableReversedMode: false,
    nyancatStyle: false,
    performanceMode: 'off',
    lowPerformanceMode: false,
    showLyricsTranslation: true,
    autoMatchLocalLyrics: true,
    lyricsBackground: true,
    lyricsAutoResumeDelay: 5000,
    lyricsAutoResumeWhenVisible: true,
    enableDesktopLyrics: false,
    desktopLyrics: { ...DEFAULT_DESKTOP_LYRICS_SETTINGS },
    enableOsdlyricsSupport: false,
    closeAppOption: 'ask',
    enableDiscordRichPresence: false,
    enableAmllWsProtocol: false,
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
    audioResolverUrl: getCurrentPageResolverURL(),
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

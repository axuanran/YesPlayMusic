import { playlistCategories } from '@/utils/staticData';
import shortcuts from '@/utils/shortcuts';
import { isElectron } from '@/utils/env';
import { DEFAULT_DESKTOP_LYRICS_SETTINGS } from '@/utils/desktopLyricsSettings';
import { getDefaultUiLayout } from '@/utils/uiLayout';

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
    lyricsAutoFollow: true,
    lyricsCenterCurrentLine: true,
    lyricsClickToSeek: true,
    lyricsAutoResumeDelay: 3000,
    enableDesktopLyrics: false,
    desktopLyrics: { ...DEFAULT_DESKTOP_LYRICS_SETTINGS },
    enableOsdlyricsSupport: false,
    closeAppOption: 'ask',
    enableDiscordRichPresence: false,
    enableAmllWsProtocol: false,
    enableGlobalShortcut: false,
    mcpServer: {
      enabled: false,
      host: '127.0.0.1',
      port: 27233,
    },
    showLibraryDefault: false,
    subTitleDefault: false,
    layout: getDefaultUiLayout(),
    linuxEnableCustomTitlebar: false,
    trayIconTheme: 'auto',
    enabledPlaylistCategories,
    neteaseApiUrl: '',
    proxyConfig: {
      protocol: 'noProxy',
      server: '',
      port: null,
    },
    enableRealIP: false,
    realIP: null,
    useAudioResolver: true,
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

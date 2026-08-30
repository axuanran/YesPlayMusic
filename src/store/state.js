import initLocalStorage from './initLocalStorage';
import pkg from '../../package.json';
import updateApp from '@/utils/updateApp';
import { loadClientPlaybackHistory } from '@/utils/clientPlaybackHistory';

if (localStorage.getItem('appVersion') === null) {
  localStorage.setItem('settings', JSON.stringify(initLocalStorage.settings));
  localStorage.setItem('data', JSON.stringify(initLocalStorage.data));
  localStorage.setItem('appVersion', pkg.version);
}

updateApp();

export default {
  showLyrics: false,
  enableScrolling: true,
  title: 'YesPlayMusic',
  liked: {
    songs: [],
    songsWithDetails: [], // 只有前12首
    playlists: [],
    albums: [],
    artists: [],
    mvs: [],
    cloudDisk: [],
    playHistory: {
      weekData: [],
      allData: [],
    },
  },
  clientPlaybackHistory: loadClientPlaybackHistory(),
  contextMenu: {
    clickObjectID: 0,
    showMenu: false,
  },
  toast: {
    show: false,
    text: '',
    timer: null,
  },
  modals: {
    addTrackToPlaylistModal: {
      show: false,
      selectedTrackID: 0,
    },
    newPlaylistModal: {
      show: false,
      afterCreateAddTrackID: 0,
    },
    downloadTrackModal: {
      show: false,
      selectedTrack: null,
      selectedTracks: [],
      playlistName: '',
    },
    cachedTracksModal: {
      show: false,
    },
  },
  dailyTracks: [],
  lastfm: JSON.parse(localStorage.getItem('lastfm')) || {},
  player: JSON.parse(localStorage.getItem('player')),
  playerVersion: 0,
  playerProgressVersion: 0,
  playerTrackVersion: 0,
  settings: JSON.parse(localStorage.getItem('settings')),
  data: JSON.parse(localStorage.getItem('data')),
};

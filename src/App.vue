<template>
  <div
    id="app"
    :class="{
      'user-select-none': userSelectNone,
      'performance-mode-balanced': performanceMode === 'balanced',
      'performance-mode-aggressive': performanceMode === 'aggressive',
    }"
  >
    <Scrollbar v-show="!showLyrics" ref="scrollbar" />
    <Navbar v-show="showNavbar" ref="navbar" />
    <main
      ref="main"
      :style="{ overflow: enableScrolling ? 'auto' : 'hidden' }"
      @scroll.passive="handleScroll"
    >
      <router-view v-slot="{ Component }">
        <keep-alive :include="keepAliveComponents">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
    <transition name="slide-up">
      <Player v-if="enablePlayer" v-show="showPlayer" ref="player" />
    </transition>
    <Toast />
    <ModalAddTrackToPlaylist v-if="isAccountLoggedIn" />
    <ModalNewPlaylist v-if="isAccountLoggedIn" />
    <ModalDownloadTrack v-if="isDownloadEnabled" />
    <ModalCachedTracks v-if="isElectron" />
    <transition v-if="enablePlayer" name="slide-up">
      <Lyrics v-show="showLyrics" />
    </transition>
  </div>
</template>

<script>
import ModalAddTrackToPlaylist from './components/ModalAddTrackToPlaylist.vue';
import ModalNewPlaylist from './components/ModalNewPlaylist.vue';
import ModalDownloadTrack from './components/ModalDownloadTrack.vue';
import ModalCachedTracks from './components/ModalCachedTracks.vue';
import Scrollbar from './components/Scrollbar.vue';
import Navbar from './components/Navbar.vue';
import Player from './components/Player.vue';
import Toast from './components/Toast.vue';
import { ipcRenderer } from './electron/ipcRenderer';
import { isAccountLoggedIn, isLooseLoggedIn } from '@/utils/auth';
import Lyrics from './views/lyrics.vue';
import { mapState } from 'vuex';
import { isDownloadEnabled, isElectron } from '@/utils/env';

export default {
  name: 'App',
  components: {
    Navbar,
    Player,
    Toast,
    ModalAddTrackToPlaylist,
    ModalNewPlaylist,
    ModalDownloadTrack,
    ModalCachedTracks,
    Lyrics,
    Scrollbar,
  },
  data() {
    return {
      isElectron,
      isDownloadEnabled,
      userSelectNone: false,
      removeDesktopLyricsSettingsListener: null,
      // keep-alive :include matches component name (PascalCase), not route name
      keepAliveComponents: [
        'Home',
        'Artist',
        'ArtistMV',
        'Next',
        'Search',
        'Explore',
        'Library',
        'LocalMusic',
        'Streaming',
      ],
    };
  },
  computed: {
    ...mapState(['showLyrics', 'settings', 'player', 'enableScrolling']),
    performanceMode() {
      if (this.settings.performanceMode) return this.settings.performanceMode;
      return this.settings.lowPerformanceMode ? 'balanced' : 'off';
    },
    isAccountLoggedIn() {
      return isAccountLoggedIn();
    },
    showPlayer() {
      return (
        [
          'mv',
          'loginUsername',
          'login',
          'loginAccount',
          'lastfmCallback',
        ].includes(this.$route.name) === false
      );
    },
    enablePlayer() {
      return this.$route.name !== 'lastfmCallback';
    },
    showNavbar() {
      return this.$route.name !== 'lastfmCallback';
    },
  },
  created() {
    if (this.isElectron) {
      ipcRenderer(this);
      this.removeDesktopLyricsSettingsListener =
        window.electronAPI?.desktopLyrics?.onSettingsChanged?.(value => {
          this.$store.commit('updateSettings', {
            key: 'desktopLyrics',
            value,
          });
          this.$store.commit('updateSettings', {
            key: 'enableDesktopLyrics',
            value: value?.enabled === true,
          });
        }) || null;
    }
    window.addEventListener('keydown', this.handleKeydown);
    window.addEventListener('focus', this.syncPlaybackState);
    document.addEventListener('visibilitychange', this.syncPlaybackState);
    this.fetchData();
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('focus', this.syncPlaybackState);
    document.removeEventListener('visibilitychange', this.syncPlaybackState);
    this.removeDesktopLyricsSettingsListener?.();
  },
  methods: {
    syncPlaybackState() {
      if (document.visibilityState === 'hidden') return;
      this.player.syncPlaybackState?.();
    },
    handleKeydown(e) {
      if (e.code === 'Space') {
        if (e.target.tagName === 'INPUT') return false;
        if (this.$route.name === 'mv') return false;
        e.preventDefault();
        this.player.playOrPause();
      }
    },
    fetchData() {
      if (!isLooseLoggedIn()) return;
      this.$store.dispatch('fetchLikedSongs');
      this.$store.dispatch('fetchLikedSongsWithDetails');
      this.$store.dispatch('fetchLikedPlaylist');
      if (isAccountLoggedIn()) {
        this.$store.dispatch('fetchLikedAlbums');
        this.$store.dispatch('fetchLikedArtists');
        this.$store.dispatch('fetchLikedMVs');
        this.$store.dispatch('fetchCloudDisk');
      }
    },
    handleScroll() {
      this.$refs.scrollbar?.handleScroll?.();
    },
  },
};
</script>

<style lang="scss">
#app {
  width: 100%;
  transition:
    background-color 0.4s,
    color 0.4s;
}

main {
  position: fixed;
  top: 0;
  bottom: 0;
  right: 0;
  left: 0;
  overflow: auto;
  padding: 64px 10vw 96px 10vw;
  box-sizing: border-box;
  scrollbar-width: none; // firefox
}

@media (max-width: 1336px) {
  main {
    padding: 64px 5vw 96px 5vw;
  }
}

main::-webkit-scrollbar {
  width: 0px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.4s;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>

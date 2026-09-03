<template>
  <div
    id="app"
    :class="{
      'user-select-none': userSelectNone,
      'performance-mode-balanced': performanceMode === 'balanced',
      'performance-mode-aggressive': performanceMode === 'aggressive',
      'window-hidden': windowHidden,
    }"
  >
    <Scrollbar v-show="!showLyrics" ref="scrollbar" />
    <Navbar v-show="showNavbar" ref="navbar" />
    <MobileNavigation v-show="showNavbar && !showLyrics" />
    <main
      ref="main"
      :style="{ overflow: enableScrolling ? 'auto' : 'hidden' }"
      @scroll.passive="handleScroll"
    >
      <router-view v-slot="{ Component }">
        <keep-alive :include="keepAliveComponents" :max="4">
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>
    <transition name="slide-up">
      <Player v-if="enablePlayer" v-show="showPlayer" ref="player" />
    </transition>
    <Toast />
    <ModalAddTrackToPlaylist
      v-if="isAccountLoggedIn && modals.addTrackToPlaylistModal.show"
    />
    <ModalNewPlaylist
      v-if="isAccountLoggedIn && modals.newPlaylistModal.show"
    />
    <ModalDownloadTrack
      v-if="isTrackDownloadEnabled && modals.downloadTrackModal.show"
    />
    <ModalCachedTracks
      v-if="(isElectron || isCapacitor) && modals.cachedTracksModal.show"
    />
    <transition v-if="enablePlayer && lyricsMounted" name="slide-up">
      <Lyrics
        :key="player.currentTrack?.id ?? 'empty'"
        v-show="showLyrics"
      />
    </transition>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import Scrollbar from './components/Scrollbar.vue';
import Navbar from './components/Navbar.vue';
import MobileNavigation from './components/MobileNavigation.vue';
import Player from './components/Player.vue';
import Toast from './components/Toast.vue';
import { ipcRenderer } from './electron/ipcRenderer';
import { isAccountLoggedIn, isLooseLoggedIn } from '@/utils/auth';
import { mapState } from 'vuex';
import { isCapacitor, isElectron, isTrackDownloadEnabled } from '@/utils/env';
import { scheduleAfterFirstPaint } from '@/utils/afterFirstPaint';
import { shouldHandlePlaybackSpace } from '@/utils/keyboardShortcuts';

const ModalAddTrackToPlaylist = defineAsyncComponent(
  () => import('./components/ModalAddTrackToPlaylist.vue')
);
const ModalNewPlaylist = defineAsyncComponent(
  () => import('./components/ModalNewPlaylist.vue')
);
const ModalDownloadTrack = defineAsyncComponent(
  () => import('./components/ModalDownloadTrack.vue')
);
const ModalCachedTracks = defineAsyncComponent(
  () => import('./components/ModalCachedTracks.vue')
);
const Lyrics = defineAsyncComponent(() => import('./views/lyrics.vue'));

export default {
  name: 'App',
  components: {
    Navbar,
    MobileNavigation,
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
      isCapacitor,
      isElectron,
      isTrackDownloadEnabled,
      userSelectNone: false,
      windowHidden: document.visibilityState === 'hidden',
      removeDesktopLyricsSettingsListener: null,
      cancelStartupDataLoad: null,
      lyricsMounted: false,
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
    ...mapState([
      'showLyrics',
      'settings',
      'player',
      'enableScrolling',
      'modals',
    ]),
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
  watch: {
    showLyrics: {
      immediate: true,
      handler(value) {
        if (value) this.lyricsMounted = true;
      },
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
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('beforeunload', this.flushPlayerPersistence);
  },
  mounted() {
    this.cancelStartupDataLoad = scheduleAfterFirstPaint(this.fetchData);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('focus', this.syncPlaybackState);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    window.removeEventListener('beforeunload', this.flushPlayerPersistence);
    this.cancelStartupDataLoad?.();
    this.removeDesktopLyricsSettingsListener?.();
  },
  methods: {
    flushPlayerPersistence() {
      this.player.flushPersistence?.();
    },

    syncPlaybackState() {
      if (document.visibilityState === 'hidden') return;
      this.player.syncPlaybackState?.();
    },
    handleVisibilityChange() {
      this.windowHidden = document.visibilityState === 'hidden';
      if (this.windowHidden) {
        this.flushPlayerPersistence();
        return;
      }
      this.syncPlaybackState();
    },
    handleKeydown(event) {
      if (!shouldHandlePlaybackSpace(event, this.$route.name)) return;
      event.preventDefault();
      this.player.playOrPause();
    },
    fetchData() {
      if (!isLooseLoggedIn()) return;
      this.$store.dispatch('fetchLikedSongs');
      this.$store.dispatch('fetchLikedSongsWithDetails');
      this.$store.dispatch('fetchLikedPlaylist');
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

#app.window-hidden *,
#app.window-hidden *::before,
#app.window-hidden *::after {
  animation-play-state: paused !important;
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

@media (max-width: 768px) {
  main {
    padding: calc(72px + env(safe-area-inset-top)) 16px
      calc(154px + env(safe-area-inset-bottom)) 16px;
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

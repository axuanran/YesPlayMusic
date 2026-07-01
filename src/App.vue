<template>
  <div
    id="app"
    :class="{
      'user-select-none': userSelectNone,
      'low-performance-mode': settings.lowPerformanceMode,
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
    <transition v-if="enablePlayer" name="slide-up">
      <Lyrics v-show="showLyrics" />
    </transition>
  </div>
</template>

<script>
import ModalAddTrackToPlaylist from './components/ModalAddTrackToPlaylist.vue';
import ModalNewPlaylist from './components/ModalNewPlaylist.vue';
import Scrollbar from './components/Scrollbar.vue';
import Navbar from './components/Navbar.vue';
import Player from './components/Player.vue';
import Toast from './components/Toast.vue';
import { ipcRenderer } from './electron/ipcRenderer';
import { isAccountLoggedIn, isLooseLoggedIn } from '@/utils/auth';
import Lyrics from './views/lyrics.vue';
import { mapState } from 'vuex';
import { isElectron } from '@/utils/env';

const LOW_PERFORMANCE_SETTING_ID = 'low-performance-mode-setting';

export default {
  name: 'App',
  components: {
    Navbar,
    Player,
    Toast,
    ModalAddTrackToPlaylist,
    ModalNewPlaylist,
    Lyrics,
    Scrollbar,
  },
  data() {
    return {
      isElectron,
      userSelectNone: false,
      // keep-alive :include matches component name (PascalCase), not route name
      keepAliveComponents: [
        'Home',
        'Artist',
        'ArtistMV',
        'Next',
        'Search',
        'Explore',
        'Library',
      ],
    };
  },
  computed: {
    ...mapState(['showLyrics', 'settings', 'player', 'enableScrolling']),
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
      return this.player.enabled && this.$route.name !== 'lastfmCallback';
    },
    showNavbar() {
      return this.$route.name !== 'lastfmCallback';
    },
  },
  watch: {
    '$route.name': {
      immediate: true,
      handler() {
        this.$nextTick(this.syncLowPerformanceSettingItem);
      },
    },
    'settings.lowPerformanceMode'() {
      this.$nextTick(this.syncLowPerformanceSettingItem);
    },
    'settings.lang'() {
      this.$nextTick(this.syncLowPerformanceSettingItem);
    },
  },
  created() {
    if (this.isElectron) ipcRenderer(this);
    window.addEventListener('keydown', this.handleKeydown);
    this.fetchData();
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleKeydown);
    document.getElementById(LOW_PERFORMANCE_SETTING_ID)?.remove();
  },
  methods: {
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
    syncLowPerformanceSettingItem() {
      const existing = document.getElementById(LOW_PERFORMANCE_SETTING_ID);
      if (this.$route.name !== 'settings') {
        existing?.remove();
        return;
      }

      const container = document.querySelector('.settings-page .container');
      if (!container) return;

      const customizationTitle = Array.from(container.querySelectorAll('h3')).find(
        element => element.textContent.trim() === this.$t('settings.customization')
      );
      if (!customizationTitle) return;

      const item = existing || document.createElement('div');
      item.id = LOW_PERFORMANCE_SETTING_ID;
      item.className = 'item';
      item.innerHTML = `
        <div class="left">
          <div class="title"></div>
          <div class="description"></div>
        </div>
        <div class="right">
          <div class="toggle">
            <input id="low-performance-mode" type="checkbox" name="low-performance-mode" />
            <label for="low-performance-mode"></label>
          </div>
        </div>
      `;

      if (!item.parentElement) {
        customizationTitle.after(item);
      }

      item.querySelector('.title').textContent = this.$t(
        'settings.lowPerformanceMode.title'
      );
      item.querySelector('.description').textContent = this.$t(
        'settings.lowPerformanceMode.description'
      );

      const input = item.querySelector('input');
      input.checked = this.settings.lowPerformanceMode === true;
      input.onchange = event => {
        this.$store.commit('updateSettings', {
          key: 'lowPerformanceMode',
          value: event.target.checked,
        });
      };
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
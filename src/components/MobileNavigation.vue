<template>
  <div class="mobile-navigation">
    <header class="mobile-topbar">
      <button
        v-if="showBackButton"
        class="topbar-button"
        type="button"
        aria-label="Back"
        @click="$router.back()"
      >
        <svg-icon icon-class="arrow-left" />
      </button>
      <div v-else class="brand-mark" aria-hidden="true">X</div>

      <div class="mobile-page-title">{{ pageTitle }}</div>

      <div class="topbar-actions">
        <button
          v-if="showCacheAction"
          class="topbar-button"
          type="button"
          :aria-label="$t('settings.viewCachedTracks')"
          @click="showCachedTracks"
        >
          <svg-icon icon-class="list" />
        </button>
        <button
          class="topbar-button"
          type="button"
          :aria-label="$t('nav.search')"
          @click="$router.push({ name: 'search' })"
        >
          <svg-icon icon-class="search" />
        </button>
        <button
          v-if="showLoginAction"
          class="topbar-button login-action"
          type="button"
          :aria-label="$t('login.login')"
          @click="toLogin"
        >
          <svg-icon icon-class="login" />
          <span>{{ $t('login.login') }}</span>
        </button>
      </div>
    </header>

    <nav class="mobile-tabbar" :aria-label="$t('nav.home')">
      <router-link
        v-for="item in tabs"
        :key="item.routeName"
        :to="{ name: item.routeName }"
        class="mobile-tab"
        :class="{ active: item.activeRoutes.includes($route.name) }"
      >
        <svg-icon :icon-class="item.icon" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script>
import { mapMutations, mapState } from 'vuex';
import { isLooseLoggedIn } from '@/utils/auth';
import { isCapacitor } from '@/utils/env';

const PRIMARY_ROUTES = ['home', 'explore', 'library', 'settings'];
const LOGIN_ROUTES = ['login', 'loginUsername', 'loginAccount'];

export default {
  name: 'MobileNavigation',
  computed: {
    ...mapState(['data']),
    showLoginAction() {
      // loginMode makes this computed property update immediately after login/logout.
      void this.data.loginMode;
      return !isLooseLoggedIn() && !LOGIN_ROUTES.includes(this.$route.name);
    },
    showCacheAction() {
      return isCapacitor && this.$route.name === 'settings';
    },
    showBackButton() {
      return !PRIMARY_ROUTES.includes(this.$route.name);
    },
    pageTitle() {
      const titles = {
        home: 'XuMP',
        explore: this.$t('nav.explore'),
        library: this.$t('nav.library'),
        settings: this.$t('library.userProfileMenu.settings'),
        search: this.$t('nav.search'),
        searchType: this.$t('nav.search'),
        login: this.$t('login.login'),
        loginUsername: this.$t('login.usernameLogin'),
        loginAccount: this.$t('login.loginText'),
        playlist: this.$t('playlist.playlist'),
        likedSongs: this.$t('library.likedSongs'),
        album: this.$t('library.albums'),
        artist: this.$t('library.artists'),
        artistMV: 'MV',
        mv: 'MV',
        next: this.$t('player.nextUp'),
        newAlbum: this.$t('home.newAlbum'),
        podcast: this.$t('podcast.title'),
        localPlaylist: this.$t('localMusic.folderPlaylist'),
        streaming: this.$t('nav.streaming'),
        dailySongs: '每日推荐',
        lastfmCallback: 'Last.fm',
      };
      return titles[this.$route.name] || 'XuMP';
    },
    tabs() {
      return [
        {
          routeName: 'home',
          icon: 'home',
          label: this.$t('nav.home'),
          activeRoutes: ['home'],
        },
        {
          routeName: 'explore',
          icon: 'compass',
          label: this.$t('nav.explore'),
          activeRoutes: ['explore'],
        },
        {
          routeName: 'library',
          icon: 'library',
          label: this.$t('nav.library'),
          activeRoutes: ['library', 'likedSongs', 'localPlaylist', 'streaming'],
        },
        {
          routeName: 'settings',
          icon: 'settings',
          label: this.$t('library.userProfileMenu.settings'),
          activeRoutes: ['settings'],
        },
      ];
    },
  },
  methods: {
    ...mapMutations(['updateModal']),
    showCachedTracks() {
      this.updateModal({
        modalName: 'cachedTracksModal',
        key: 'show',
        value: true,
      });
    },
    toLogin() {
      this.$router.push({ name: isCapacitor ? 'loginAccount' : 'login' });
    },
  },
};
</script>

<style lang="scss" scoped>
.mobile-navigation {
  display: none;
}

@media (max-width: 768px),
  (max-height: 500px) and (orientation: landscape) and (pointer: coarse) {
  .mobile-navigation {
    display: block;
  }

  .mobile-topbar,
  .mobile-tabbar {
    position: fixed;
    right: 0;
    left: 0;
    z-index: 110;
    background: var(--color-navbar-bg);
    backdrop-filter: saturate(180%) blur(22px);
  }

  .mobile-topbar {
    top: 0;
    height: 56px;
    padding: env(safe-area-inset-top) 16px 0;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    box-sizing: content-box;
    border-bottom: 1px solid rgba(128, 128, 128, 0.12);
  }

  .brand-mark {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: white;
    background: var(--color-primary-gradient);
    font-size: 18px;
    font-weight: 800;
  }

  .mobile-page-title {
    overflow: hidden;
    color: var(--color-text);
    font-size: 18px;
    font-weight: 700;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .topbar-actions {
    display: flex;
    gap: 4px;
    justify-content: flex-end;
  }

  .topbar-button {
    width: 40px;
    height: 40px;
    padding: 0;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: var(--color-text);
    -webkit-tap-highlight-color: transparent;

    .svg-icon {
      width: 21px;
      height: 21px;
    }

    &:active {
      background: var(--color-secondary-bg-for-transparent);
      transform: scale(0.94);
    }
  }

  .login-action {
    width: auto;
    padding: 0 10px;
    gap: 5px;
    color: var(--color-primary);
    font-size: 13px;
    font-weight: 700;

    .svg-icon {
      width: 18px;
      height: 18px;
    }
  }

  .mobile-tabbar {
    bottom: 0;
    height: 58px;
    padding-bottom: env(safe-area-inset-bottom);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-top: 1px solid rgba(128, 128, 128, 0.12);
  }

  .mobile-tab {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: var(--color-secondary);
    font-size: 10px;
    font-weight: 600;
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;

    .svg-icon {
      width: 21px;
      height: 21px;
    }

    &.active {
      color: var(--color-primary);
    }
  }
}

@media (max-width: 420px) {
  .mobile-topbar {
    grid-template-columns: 84px minmax(0, 1fr) 84px;
  }

  .brand-mark,
  .topbar-button:first-child {
    justify-self: start;
  }

  .topbar-actions {
    width: 84px;
    justify-self: end;
  }

  .login-action {
    width: 40px;
    padding: 0;
  }

  .login-action span {
    display: none;
  }
}
</style>

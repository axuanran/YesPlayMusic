<template>
  <div v-show="show" class="search-page">
    <form
      v-if="isCapacitor"
      class="mobile-search-bar"
      role="search"
      @submit.prevent="submitMobileSearch"
    >
      <svg-icon class="mobile-search-icon" icon-class="search" />
      <input
        ref="mobileSearchInput"
        v-model="searchInput"
        class="mobile-search-input"
        type="search"
        inputmode="search"
        enterkeyhint="search"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        :placeholder="$t('nav.search')"
        :aria-label="$t('nav.search')"
      />
      <button
        v-if="searchInput"
        class="mobile-search-clear"
        type="button"
        aria-label="Clear search"
        @click="clearMobileSearch"
      >
        ×
      </button>
    </form>

    <div v-show="artists.length > 0 || albums.length > 0" class="row">
      <div v-show="artists.length > 0" class="artists">
        <div v-show="artists.length > 0" class="section-title"
          >{{ $t('search.artist')
          }}<router-link :to="`/search/${keywords}/artists`">{{
            $t('home.seeMore')
          }}</router-link></div
        >
        <CoverRow
          type="artist"
          :column-number="3"
          :items="artists.slice(0, 3)"
          gap="34px 24px"
        />
      </div>

      <div class="albums">
        <div v-show="albums.length > 0" class="section-title"
          >{{ $t('search.album')
          }}<router-link :to="`/search/${keywords}/albums`">{{
            $t('home.seeMore')
          }}</router-link></div
        >
        <CoverRow
          type="album"
          :items="albums.slice(0, 3)"
          sub-text="artist"
          :column-number="3"
          sub-text-font-size="14px"
          gap="34px 24px"
          :play-button-size="26"
        />
      </div>
    </div>

    <div v-show="tracks.length > 0" class="tracks">
      <div class="section-title"
        >{{ $t('search.song')
        }}<router-link :to="`/search/${keywords}/tracks`">{{
          $t('home.seeMore')
        }}</router-link></div
      >
      <TrackList :tracks="tracks" type="tracklist" />
    </div>

    <div v-show="musicVideos.length > 0" class="music-videos">
      <div class="section-title"
        >{{ $t('search.mv')
        }}<router-link :to="`/search/${keywords}/music-videos`">{{
          $t('home.seeMore')
        }}</router-link></div
      >
      <MvRow :mvs="musicVideos.slice(0, 5)" />
    </div>

    <div v-show="playlists.length > 0" class="playlists">
      <div class="section-title"
        >{{ $t('search.playlist')
        }}<router-link :to="`/search/${keywords}/playlists`">{{
          $t('home.seeMore')
        }}</router-link></div
      >
      <CoverRow
        type="playlist"
        :items="playlists.slice(0, 12)"
        sub-text="title"
        :column-number="6"
        sub-text-font-size="14px"
        gap="34px 24px"
        :play-button-size="26"
      />
    </div>

    <div v-show="podcasts.length > 0" class="podcasts">
      <div class="section-title"
        >{{ $t('search.podcast')
        }}<router-link :to="`/search/${keywords}/podcasts`">{{
          $t('home.seeMore')
        }}</router-link></div
      >
      <CoverRow
        type="podcast"
        :items="podcasts.slice(0, 12)"
        sub-text="none"
        :column-number="6"
        gap="34px 24px"
        :show-play-button="false"
      />
    </div>

    <div v-show="!loading && !haveResult" class="no-results">
      <div
        ><svg-icon icon-class="search" />
        {{
          keywords.length === 0 ? '输入关键字搜索' : $t('search.noResult')
        }}</div
      >
    </div>
  </div>
</template>

<script>
import { mapActions } from 'vuex';
import { getTrackDetail } from '@/api/track';
import { search } from '@/api/others';
import { isCapacitor } from '@/utils/env';
import NProgress from 'nprogress';

import TrackList from '@/components/TrackList.vue';
import MvRow from '@/components/MvRow.vue';
import CoverRow from '@/components/CoverRow.vue';

const SEARCH_TIMEOUT_MS = 8000;
const SEARCH_TYPES = [
  'artists',
  'albums',
  'tracks',
  'musicVideos',
  'playlists',
  'podcasts',
];

export default {
  name: 'Search',
  components: {
    TrackList,
    MvRow,
    CoverRow,
  },
  data() {
    return {
      isCapacitor,
      searchInput: this.$route.params.keywords ?? '',
      show: false,
      tracks: [],
      artists: [],
      albums: [],
      playlists: [],
      podcasts: [],
      musicVideos: [],
      loading: false,
      progressTimer: null,
      searchAbortController: null,
      searchRequestId: 0,
    };
  },
  computed: {
    keywords() {
      return this.$route.params.keywords ?? '';
    },
    haveResult() {
      return (
        this.tracks.length +
          this.artists.length +
          this.albums.length +
          this.playlists.length +
          this.podcasts.length +
          this.musicVideos.length >
        0
      );
    },
  },
  watch: {
    keywords(value) {
      this.searchInput = value ?? '';
      this.getData();
    },
  },
  created() {
    this.getData();
  },
  activated() {
    if (this.isCapacitor) this.focusMobileSearch();
  },
  beforeUnmount() {
    clearTimeout(this.progressTimer);
    this.searchAbortController?.abort();
    NProgress.done();
  },
  methods: {
    ...mapActions(['showToast']),
    focusMobileSearch() {
      this.$nextTick(() => this.$refs.mobileSearchInput?.focus());
    },
    submitMobileSearch() {
      const keywords = this.searchInput.trim();
      if (!keywords) {
        if (this.keywords) this.$router.push({ name: 'search' });
        return;
      }

      if (keywords === this.keywords.trim()) {
        this.getData();
      } else {
        this.$router.push({ name: 'search', params: { keywords } });
      }
      this.$refs.mobileSearchInput?.blur();
    },
    clearMobileSearch() {
      this.searchInput = '';
      if (this.keywords) this.$router.push({ name: 'search' });
      this.focusMobileSearch();
    },
    playTrackInSearchResult(id) {
      let track = this.tracks.find(t => t.id === id);
      this.$store.state.player.appendTrackToPlayerList(track, true);
    },
    search(type, keywords, signal) {
      const typeTable = {
        musicVideos: 1004,
        tracks: 1,
        albums: 10,
        artists: 100,
        playlists: 1000,
        podcasts: 1009,
      };
      return search(
        {
          keywords,
          type: typeTable[type],
          limit: 16,
        },
        {
          signal,
          timeout: SEARCH_TIMEOUT_MS,
        }
      )
        .then(result => {
          return { result: result.result, type };
        })
        .catch(err => {
          return {
            canceled:
              signal.aborted ||
              err.code === 'ERR_CANCELED' ||
              err.name === 'CanceledError',
            error: err,
            result: undefined,
            type,
          };
        });
    },
    clearResults() {
      this.tracks = [];
      this.artists = [];
      this.albums = [];
      this.playlists = [];
      this.podcasts = [];
      this.musicVideos = [];
    },
    applySearchResult(type, result, requestId, signal) {
      switch (type) {
        case 'musicVideos':
          this.musicVideos = result.mvs ?? [];
          break;
        case 'artists':
          this.artists = result.artists ?? [];
          break;
        case 'albums':
          this.albums = result.albums ?? [];
          break;
        case 'tracks':
          this.tracks = result.songs ?? [];
          void this.getTracksDetail(requestId, signal, this.tracks);
          break;
        case 'playlists':
          this.playlists = result.playlists ?? [];
          break;
        case 'podcasts':
          this.podcasts = result.djRadios ?? [];
          break;
      }
    },
    getData() {
      this.searchAbortController?.abort();
      clearTimeout(this.progressTimer);
      NProgress.done();
      const requestId = ++this.searchRequestId;
      const keywords = this.keywords.trim();
      this.clearResults();
      this.show = true;

      if (!keywords) {
        this.loading = false;
        this.searchAbortController = null;
        return;
      }

      const controller = new AbortController();
      const errors = [];
      this.searchAbortController = controller;
      this.loading = true;
      this.progressTimer = setTimeout(() => {
        if (requestId === this.searchRequestId && this.loading) {
          NProgress.start();
        }
      }, 1000);

      const requests = SEARCH_TYPES.map(type =>
        this.search(type, keywords, controller.signal).then(response => {
          if (requestId !== this.searchRequestId || response.canceled) return;
          if (response.result === undefined) {
            errors.push(response.error);
            return;
          }
          this.applySearchResult(
            response.type,
            response.result,
            requestId,
            controller.signal
          );
        })
      );

      Promise.allSettled(requests).then(() => {
        if (requestId !== this.searchRequestId) return;
        clearTimeout(this.progressTimer);
        this.progressTimer = null;
        this.loading = false;
        this.searchAbortController = null;
        NProgress.done();
        if (errors.length > 0) {
          const error = errors[0];
          this.showToast(
            error?.response?.data?.msg ||
              error?.response?.data?.message ||
              error?.message ||
              '搜索请求超时'
          );
        }
      });
    },
    getTracksDetail(requestId, signal, tracks) {
      const trackIDs = tracks.map(t => t.id);
      if (trackIDs.length === 0) return;
      getTrackDetail(trackIDs.join(','), {
        signal,
        timeout: SEARCH_TIMEOUT_MS,
      })
        .then(result => {
          if (requestId === this.searchRequestId && !signal.aborted) {
            this.tracks = result.songs;
          }
        })
        .catch(() => undefined);
    },
  },
};
</script>

<style lang="scss" scoped>
.mobile-search-bar {
  position: sticky;
  top: calc(56px + env(safe-area-inset-top));
  z-index: 30;
  width: 100%;
  min-height: 48px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  border-radius: 14px;
  background: var(--color-navbar-bg);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  backdrop-filter: saturate(180%) blur(18px);
}

.mobile-search-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  color: var(--color-text);
  opacity: 0.56;
}

.mobile-search-input {
  min-width: 0;
  flex: 1;
  padding: 4px 0;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: 16px;
  line-height: 24px;

  &::placeholder {
    color: var(--color-text);
    opacity: 0.42;
  }
}

.mobile-search-clear {
  width: 30px;
  height: 30px;
  padding: 0;
  flex: 0 0 auto;
  border-radius: 50%;
  color: var(--color-text);
  background: rgba(128, 128, 128, 0.14);
  font-size: 21px;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
}

.section-title {
  font-weight: 600;
  font-size: 22px;
  opacity: 0.88;
  color: var(--color-text);
  margin-bottom: 16px;

  display: flex;
  justify-content: space-between;
  align-items: center;
  a {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.68;
  }
}

.row {
  display: flex;
  flex-wrap: wrap;
  margin-top: 32px;

  .artists {
    flex: 1;
    margin-right: 8rem;
  }
  .albums {
    flex: 1;
  }
}

.tracks,
.music-videos,
.playlists,
.podcasts {
  margin-top: 46px;
}

.no-results {
  position: absolute;
  top: 64px;
  right: 0;
  left: 0;
  bottom: 64px;
  font-size: 24px;
  color: var(--color-text);
  opacity: 0.38;
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: none;
  div {
    display: flex;
    align-items: center;
  }
  .svg-icon {
    height: 24px;
    width: 24px;
    margin-right: 16px;
  }
}

@media (max-width: 768px) {
  .row {
    gap: 30px;

    .artists,
    .albums {
      min-width: 100%;
      margin-right: 0;
    }
  }

  .tracks,
  .music-videos,
  .playlists,
  .podcasts {
    margin-top: 32px;
  }

  .no-results {
    top: calc(120px + env(safe-area-inset-top));
    bottom: calc(120px + env(safe-area-inset-bottom));
    padding: 0 24px;
    box-sizing: border-box;
    font-size: 18px;
    text-align: center;
  }
}
</style>

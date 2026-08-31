<template>
  <div class="home">
    <div v-if="loadError" class="home-load-notice" role="status">
      <span>{{ $t('home.loadFailed') }}</span>
      <button type="button" @click="loadData(true)">
        {{ $t('home.retry') }}
      </button>
    </div>
    <div
      v-if="settings.showPlaylistsByAppleMusic !== false"
      class="index-row first-row"
    >
      <div class="title"> by Apple Music </div>
      <CoverRow
        :type="'playlist'"
        :items="byAppleMusic"
        sub-text="appleMusic"
        :image-size="1024"
        eager
      />
    </div>
    <div
      v-show="loadingFeed || recommendPlaylist.items.length > 0"
      class="index-row"
    >
      <div class="title">
        {{ $t('home.recommendPlaylist') }}
        <router-link to="/explore?category=推荐歌单">{{
          $t('home.seeMore')
        }}</router-link>
      </div>
      <CoverRowSkeleton
        v-if="loadingFeed && recommendPlaylist.items.length === 0"
        :count="5"
      />
      <CoverRow
        v-else
        type="playlist"
        :items="recommendPlaylist.items"
        sub-text="copywriter"
      />
    </div>
    <div
      v-show="loadingFeed || podcasts.error || podcasts.items.length > 0"
      id="podcasts"
      class="index-row"
    >
      <div class="title">{{ $t('podcast.title') }}</div>
      <div v-if="podcasts.error" class="podcast-error">
        <span>{{ $t('podcast.loadFailed') }}</span>
        <ButtonTwoTone color="grey" @click="loadData(true)">
          {{ $t('podcast.retry') }}
        </ButtonTwoTone>
      </div>
      <CoverRowSkeleton
        v-else-if="loadingFeed && podcasts.items.length === 0"
        :count="5"
      />
      <CoverRow
        v-else
        type="podcast"
        :items="podcasts.items"
        sub-text="none"
        :show-play-button="false"
      />
    </div>
    <div class="index-row for-you-section">
      <div class="title"> For You </div>
      <div class="for-you-row">
        <DailyTracksCard ref="DailyTracksCard" />
        <FMCard />
      </div>
    </div>
    <div
      v-show="loadingFeed || recommendArtists.items.length > 0"
      class="index-row"
    >
      <div class="title">{{ $t('home.recommendArtist') }}</div>
      <CoverRowSkeleton
        v-if="loadingFeed && recommendArtists.items.length === 0"
        :count="6"
        :columns="6"
        circle
      />
      <CoverRow
        v-else
        type="artist"
        :column-number="6"
        :items="recommendArtists.items"
      />
    </div>
    <div
      v-show="loadingFeed || newReleasesAlbum.items.length > 0"
      class="index-row"
    >
      <div class="title">
        {{ $t('home.newAlbum') }}
        <router-link to="/new-album">{{ $t('home.seeMore') }}</router-link>
      </div>
      <CoverRowSkeleton
        v-if="loadingFeed && newReleasesAlbum.items.length === 0"
        :count="5"
      />
      <CoverRow
        v-else
        type="album"
        :items="newReleasesAlbum.items"
        sub-text="artist"
      />
    </div>
    <div v-show="loadingFeed || topList.items.length > 0" class="index-row">
      <div class="title">
        {{ $t('home.charts') }}
        <router-link to="/explore?category=排行榜">{{
          $t('home.seeMore')
        }}</router-link>
      </div>
      <CoverRowSkeleton
        v-if="loadingFeed && topList.items.length === 0"
        :count="5"
      />
      <CoverRow
        v-else
        type="playlist"
        :items="topList.items"
        sub-text="updateFrequency"
        :image-size="1024"
      />
    </div>
  </div>
</template>

<script>
import { toplists } from '@/api/playlist';
import { toplistOfArtists } from '@/api/artist';
import { newAlbums } from '@/api/album';
import { byAppleMusic } from '@/utils/staticData';
import { getRecommendPlayList } from '@/utils/playList';
import { getRecommendedPodcasts } from '@/api/podcast';
import {
  sampleHomeArtists,
  shouldRefreshHomeFeed,
} from '@/utils/homeFeedRefresh';
import NProgress from 'nprogress';
import { mapState } from 'vuex';
import CoverRow from '@/components/CoverRow.vue';
import CoverRowSkeleton from '@/components/CoverRowSkeleton.vue';
import FMCard from '@/components/FMCard.vue';
import DailyTracksCard from '@/components/DailyTracksCard.vue';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
const PROGRESS_DELAY = 800;

export default {
  name: 'Home',
  components: {
    ButtonTwoTone,
    CoverRow,
    CoverRowSkeleton,
    FMCard,
    DailyTracksCard,
  },
  data() {
    return {
      show: true,
      loadingFeed: true,
      loadError: false,
      loadPromise: null,
      loadRequestId: 0,
      loadedFeedKey: '',
      loadedAt: 0,
      progressTimer: null,
      recommendPlaylist: { items: [] },
      podcasts: {
        error: false,
        items: [],
      },
      newReleasesAlbum: { items: [] },
      topList: {
        items: [],
        ids: [19723756, 180106, 60198, 3812895, 60131],
      },
      recommendArtists: {
        items: [],
      },
    };
  },
  computed: {
    ...mapState(['data', 'settings']),
    byAppleMusic() {
      return byAppleMusic;
    },
    feedKey() {
      const language = this.settings.musicLanguage ?? 'all';
      const account = this.data.user?.userId || this.data.loginMode || 'guest';
      return `${language}:${account}`;
    },
    hasFeedContent() {
      return (
        this.recommendPlaylist.items.length > 0 ||
        this.podcasts.items.length > 0 ||
        this.newReleasesAlbum.items.length > 0 ||
        this.recommendArtists.items.length > 0 ||
        this.topList.items.length > 0
      );
    },
  },
  watch: {
    feedKey(value, previousValue) {
      if (previousValue && value !== previousValue) this.loadData(true);
    },
  },
  activated() {
    this.loadData();
    this.$parent?.$refs?.scrollbar?.restorePosition?.();
  },
  deactivated() {
    clearTimeout(this.progressTimer);
    NProgress.done();
  },
  beforeUnmount() {
    this.loadRequestId += 1;
    clearTimeout(this.progressTimer);
    NProgress.done();
  },
  methods: {
    loadData(force = false) {
      if (!force && this.loadPromise) return this.loadPromise;
      const now = Date.now();
      if (
        !shouldRefreshHomeFeed({
          feedKey: this.feedKey,
          force,
          loadedAt: this.loadedAt,
          loadedFeedKey: this.loadedFeedKey,
          now,
        })
      ) {
        return Promise.resolve();
      }

      const requestId = ++this.loadRequestId;
      const language = this.settings.musicLanguage ?? 'all';
      const artistAreas = {
        all: null,
        zh: 1,
        ea: 2,
        jp: 4,
        kr: 3,
      };
      this.loadError = false;
      this.podcasts.error = false;
      this.loadingFeed = true;
      clearTimeout(this.progressTimer);
      if (!this.hasFeedContent) {
        this.progressTimer = setTimeout(() => {
          if (requestId === this.loadRequestId && this.loadingFeed) {
            NProgress.start();
          }
        }, PROGRESS_DELAY);
      }

      const apply = callback => value => {
        if (requestId === this.loadRequestId) callback(value);
      };
      const requests = [
        getRecommendPlayList(10, false).then(
          apply(items => {
            this.recommendPlaylist.items = items;
          })
        ),
        this.loadPodcasts(requestId),
        newAlbums({
          area: language === 'all' ? 'ALL' : language,
          limit: 10,
        }).then(
          apply(data => {
            this.newReleasesAlbum.items = data.albums ?? [];
          })
        ),
        toplistOfArtists(artistAreas[language]).then(
          apply(data => {
            this.recommendArtists.items = sampleHomeArtists(
              data.list?.artists,
              6
            );
          })
        ),
        toplists().then(
          apply(data => {
            this.topList.items = (data.list ?? []).filter(item =>
              this.topList.ids.includes(item.id)
            );
          })
        ),
      ];

      const loadPromise = Promise.allSettled(requests).then(results => {
        if (requestId !== this.loadRequestId) return;
        this.loadedFeedKey = this.feedKey;
        this.loadedAt = Date.now();
        this.loadError = results.some(result => result.status === 'rejected');
        this.loadingFeed = false;
        clearTimeout(this.progressTimer);
        this.loadError = results.some(
          (result, index) => index !== 1 && result.status === 'rejected'
        );
        NProgress.done();
      });
      this.loadPromise = loadPromise;
      return loadPromise.finally(() => {
        if (requestId === this.loadRequestId) this.loadPromise = null;
      });
    },
    async loadPodcasts(requestId) {
      try {
        const data = await getRecommendedPodcasts();
        if (requestId !== this.loadRequestId) return;
        this.podcasts.items = Array.isArray(data?.djRadios)
          ? data.djRadios
          : [];
      } catch (error) {
        if (requestId === this.loadRequestId) this.podcasts.error = true;
        throw error;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.index-row {
  min-height: 300px;
  margin-top: 54px;
}

.home-load-notice {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 12px;
  margin: 24px auto -6px;
  padding: 8px 10px 8px 14px;
  color: var(--color-secondary);
  background: var(--color-secondary-bg);
  border: 1px solid rgba(128, 128, 128, 0.12);
  border-radius: 12px;
  font-size: 13px;

  button {
    padding: 5px 10px;
    color: var(--color-primary);
    background: var(--color-primary-bg-for-transparent);
    border-radius: 8px;
    font-weight: 600;
  }
}
.index-row.first-row {
  margin-top: 32px;
}
.for-you-section {
  min-height: 330px;
}
.playlists {
  display: flex;
  flex-wrap: wrap;
  margin: {
    right: -12px;
    left: -12px;
  }
  .index-playlist {
    margin: 12px 12px 24px 12px;
  }
}

.title {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  a {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.68;
  }
}

footer {
  display: flex;
  justify-content: center;
  margin-top: 48px;
}

.for-you-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  min-height: 198px;
  margin-bottom: 78px;
}

.podcast-error {
  display: flex;
  min-height: 200px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 18px;
  color: var(--color-text);
}

@media (max-width: 768px) {
  .index-row,
  .index-row.first-row {
    min-height: 0;
    margin-top: 34px;
  }

  .index-row.first-row {
    margin-top: 12px;
  }

  .title {
    margin-bottom: 16px;
    font-size: 22px;
  }

  .for-you-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    margin-bottom: 38px;
  }
}
</style>

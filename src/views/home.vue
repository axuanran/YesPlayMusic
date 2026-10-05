<template>
  <div class="home">
    <div v-if="loadError" class="home-load-notice" role="status">
      <span>{{ $t('home.loadFailed') }}</span>
      <button type="button" @click="loadData(true)">
        {{ $t('home.retry') }}
      </button>
    </div>
    <template v-for="(block, index) in homeBlocks">
      <div
        v-if="block.type === 'section' && block.widgets.length"
        :key="block.id"
        class="index-row home-section"
        :class="{ 'first-row': index === 0 }"
      >
        <div class="title">{{ sectionTitle(block) }}</div>
        <div
          class="section-widgets"
          :class="{ 'card-grid': isCardGrid(block) }"
        >
          <HomeWidget
            v-for="wId in block.widgets"
            :id="wId"
            :key="wId"
            bare
            :feed="feed"
            @retry="loadData(true)"
          />
        </div>
      </div>
      <HomeWidget
        v-else-if="block.type === 'widget'"
        :id="block.id"
        :key="block.id"
        :first="index === 0"
        :feed="feed"
        @retry="loadData(true)"
      />
    </template>
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
import { normalizeUiLayout } from '@/utils/uiLayout';
import NProgress from 'nprogress';
import { mapState } from 'vuex';
import HomeWidget from '@/components/HomeWidget.vue';
const PROGRESS_DELAY = 800;

export default {
  name: 'Home',
  components: {
    HomeWidget,
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
    /** 首页区块（栏目/卡片）由 设置 → 界面布局 决定 */
    homeBlocks() {
      return normalizeUiLayout(this.settings?.layout).home;
    },
    feed() {
      return {
        loadingFeed: this.loadingFeed,
        byAppleMusic,
        recommendPlaylist: this.recommendPlaylist.items,
        podcasts: this.podcasts,
        recommendArtists: this.recommendArtists.items,
        newReleasesAlbum: this.newReleasesAlbum.items,
        topList: this.topList.items,
      };
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
    sectionTitle(block) {
      if (block.title) return block.title;
      if (block.id === 'forYou') return this.$t('home.forYou');
      return '';
    },
    /** 栏目内全部是卡片型功能时，用卡片网格布局（如 For You） */
    isCardGrid(block) {
      return block.widgets.every(
        id => id === 'dailyTracks' || id === 'personalFM'
      );
    },
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
.home-section {
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

.section-widgets.card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  min-height: 198px;
  margin-bottom: 78px;
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

  .section-widgets.card-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    margin-bottom: 38px;
  }
}
</style>

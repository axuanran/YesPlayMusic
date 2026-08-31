<template>
  <div class="explore-page">
    <h1>{{ $t('explore.explore') }}</h1>
    <div class="buttons">
      <div
        v-for="category in settings.enabledPlaylistCategories"
        :key="category"
        class="button"
        :class="{ active: category === activeCategory && !showCatOptions }"
        @click="goToCategory(category)"
      >
        {{ category }}
      </div>
      <div
        class="button more"
        :class="{ active: showCatOptions }"
        @click="showCatOptions = !showCatOptions"
      >
        <svg-icon icon-class="more"></svg-icon>
      </div>
    </div>

    <div v-show="showCatOptions" class="panel">
      <div v-for="bigCat in allBigCats" :key="bigCat" class="big-cat">
        <div class="name">{{ bigCat }}</div>
        <div class="cats">
          <div
            v-for="cat in getCatsByBigCat(bigCat)"
            :key="cat.name"
            class="cat"
            :class="{
              active: settings.enabledPlaylistCategories.includes(cat.name),
            }"
            @click="toggleCat(cat.name)"
            ><span>{{ cat.name }}</span></div
          >
        </div>
      </div>
    </div>
    <div v-if="loadError" class="load-error" role="status">
      <span>{{ $t('explore.loadFailed') }}</span>
      <button type="button" @click="retryLoad">{{
        $t('explore.retry')
      }}</button>
    </div>

    <div class="playlists">
      <CoverRow
        type="playlist"
        :items="playlists"
        :sub-text="subText"
        :show-play-button="true"
        :show-play-count="activeCategory !== '排行榜' ? true : false"
        :image-size="activeCategory !== '排行榜' ? 512 : 1024"
      />
    </div>
    <div
      v-show="['推荐歌单', '排行榜'].includes(activeCategory) === false"
      class="load-more"
    >
      <ButtonTwoTone
        v-show="showLoadMoreButton && hasMore"
        color="grey"
        :loading="loadingMore"
        @click="getPlaylist"
        >{{ $t('explore.loadMore') }}</ButtonTwoTone
      >
    </div>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex';
import NProgress from 'nprogress';
import { topPlaylist, highQualityPlaylist, toplists } from '@/api/playlist';
import { playlistCategories } from '@/utils/staticData';
import { getRecommendPlayList } from '@/utils/playList';

import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import CoverRow from '@/components/CoverRow.vue';
import SvgIcon from '@/components/SvgIcon.vue';

export default {
  name: 'Explore',
  components: {
    CoverRow,
    ButtonTwoTone,
    SvgIcon,
  },
  beforeRouteUpdate(to, from, next) {
    const category = to.query.category || '全部';
    this.loadData(category !== this.activeCategory, category);
    next();
  },
  data() {
    return {
      show: false,
      playlists: [],
      activeCategory: '全部',
      loadingMore: false,
      showLoadMoreButton: false,
      hasMore: true,
      allBigCats: ['语种', '风格', '场景', '情感', '主题'],
      showCatOptions: false,
      loadedCategory: '',
      loadError: false,
      loadPromise: null,
      loadRequestId: 0,
      progressTimer: null,
    };
  },
  computed: {
    ...mapState(['settings']),
    subText() {
      if (this.activeCategory === '排行榜') return 'updateFrequency';
      if (this.activeCategory === '推荐歌单') return 'copywriter';
      return 'none';
    },
  },
  activated() {
    this.loadData();
    this.$parent?.$refs?.scrollbar?.restorePosition?.();
  },
  deactivated() {
    clearTimeout(this.progressTimer);
    this.progressTimer = null;
    NProgress.done();
  },
  beforeUnmount() {
    this.loadRequestId += 1;
    clearTimeout(this.progressTimer);
    NProgress.done();
  },
  methods: {
    ...mapMutations(['togglePlaylistCategory']),
    loadData(force = false, category = this.$route.query.category || '全部') {
      if (this.loadPromise && category === this.activeCategory) {
        return this.loadPromise;
      }
      if (!force && category === this.loadedCategory) {
        this.show = true;
        return Promise.resolve();
      }

      this.loadRequestId += 1;
      this.activeCategory = category;
      this.loadedCategory = '';
      this.playlists = [];
      this.hasMore = true;
      this.showLoadMoreButton = false;
      this.loadError = false;
      this.show = false;
      return this.getPlaylist({ reset: true });
    },
    goToCategory(category) {
      this.showCatOptions = false;
      this.$router.push({ name: 'explore', query: { category } });
    },
    retryLoad() {
      if (
        this.playlists.length > 0 &&
        this.loadedCategory === this.activeCategory
      ) {
        return this.getPlaylist();
      }
      return this.loadData(true, this.activeCategory);
    },
    getPlaylist({ reset = false } = {}) {
      if (this.loadPromise && !reset) return this.loadPromise;
      const requestId = this.loadRequestId;
      const category = this.activeCategory;
      this.loadingMore = true;
      this.loadError = false;

      if (reset) {
        clearTimeout(this.progressTimer);
        this.progressTimer = setTimeout(() => {
          if (requestId === this.loadRequestId && !this.show) {
            NProgress.start();
          }
        }, 1000);
      }

      let request;
      if (category === '推荐歌单') {
        request = getRecommendPlayList(100, true).then(items => ({
          hasMore: false,
          items,
        }));
      } else if (category === '精品歌单') {
        const before =
          this.playlists.length > 0
            ? this.playlists[this.playlists.length - 1].updateTime
            : 0;
        request = highQualityPlaylist({ limit: 50, before }).then(data => ({
          hasMore: data.more,
          items: data.playlists,
        }));
      } else if (category === '排行榜') {
        request = toplists().then(data => ({
          hasMore: false,
          items: data.list,
        }));
      } else {
        request = topPlaylist({
          cat: category,
          offset: this.playlists.length,
        }).then(data => ({
          hasMore: data.more,
          items: data.playlists,
        }));
      }

      const loadPromise = request
        .then(({ hasMore, items }) => {
          if (
            requestId !== this.loadRequestId ||
            category !== this.activeCategory
          ) {
            return;
          }
          if (reset) this.playlists = [];
          this.playlists.push(...items);
          this.hasMore = hasMore;
          this.loadedCategory = category;
          this.showLoadMoreButton = true;
          this.show = true;
        })
        .catch(error => {
          if (requestId !== this.loadRequestId) return;
          console.error('[explore] Failed to load playlists', error);
          this.loadError = true;
          this.show = true;
        })
        .finally(() => {
          if (requestId !== this.loadRequestId) return;
          clearTimeout(this.progressTimer);
          this.progressTimer = null;
          this.loadingMore = false;
          NProgress.done();
          if (this.loadPromise === loadPromise) this.loadPromise = null;
        });
      this.loadPromise = loadPromise;
      return loadPromise;
    },
    getCatsByBigCat(name) {
      return playlistCategories.filter(category => category.bigCat === name);
    },
    toggleCat(name) {
      this.togglePlaylistCategory(name);
    },
  },
};
</script>

<style lang="scss" scoped>
h1 {
  color: var(--color-text);
  font-size: 56px;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
}
.button {
  user-select: none;
  cursor: pointer;
  padding: 8px 16px;
  margin: 10px 16px 6px 0;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: 600;
  font-size: 18px;
  border-radius: 10px;
  background-color: var(--color-secondary-bg);
  color: var(--color-secondary);
  transition: 0.2s;

  &:hover {
    background-color: var(--color-primary-bg);
    color: var(--color-primary);
  }
}
.button.active {
  background-color: var(--color-primary-bg);
  color: var(--color-primary);
}
.panel {
  margin-top: 10px;
  background: var(--color-secondary-bg);
  border-radius: 10px;
  padding: 8px;
  color: var(--color-text);

  .big-cat {
    display: flex;
    margin-bottom: 32px;
  }

  .name {
    font-size: 24px;
    font-weight: 700;
    opacity: 0.68;
    margin-left: 24px;
    min-width: 54px;
    height: 26px;
    margin-top: 8px;
  }
  .cats {
    margin-left: 24px;
    display: flex;
    flex-wrap: wrap;
  }
  .cat {
    user-select: none;
    margin: 4px 0px 0 0;
    display: flex;
    // justify-content: center;
    align-items: center;
    font-weight: 500;
    font-size: 16px;
    transition: 0.2s;
    min-width: 98px;

    span {
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      padding: 6px 12px;
      height: 26px;
      border-radius: 10px;
      opacity: 0.88;
      &:hover {
        opacity: 1;
        background-color: var(--color-primary-bg);
        color: var(--color-primary);
      }
    }
  }
  .cat.active {
    color: var(--color-primary);
  }
}

.load-error {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 12px;
  margin: 20px auto 0;
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
.playlists {
  margin-top: 24px;
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

.button.more {
  .svg-icon {
    height: 24px;
    width: 24px;
  }
}
</style>

<template>
  <div
    v-show="isVisible"
    class="index-row"
    :class="{ 'first-row': first, bare }"
  >
    <div v-if="!bare && hasTitle" class="title">
      {{ titleText
      }}<router-link v-if="seeMoreLink" :to="seeMoreLink">{{
        $t('home.seeMore')
      }}</router-link>
    </div>

    <!-- by Apple Music -->
    <template v-if="id === 'appleMusic'">
      <CoverRow
        :type="'playlist'"
        :items="feed.byAppleMusic || []"
        sub-text="appleMusic"
        :image-size="1024"
        eager
      />
    </template>

    <!-- 推荐歌单 -->
    <template v-else-if="id === 'recommendPlaylist'">
      <CoverRowSkeleton
        v-if="feed.loadingFeed && !recommendPlaylist.length"
        :count="5"
      />
      <CoverRow
        v-else
        type="playlist"
        :items="recommendPlaylist"
        sub-text="copywriter"
      />
    </template>

    <!-- 播客 -->
    <template v-else-if="id === 'podcasts'">
      <div v-if="podcasts.error" class="podcast-error">
        <span>{{ $t('podcast.loadFailed') }}</span>
        <ButtonTwoTone color="grey" @click="$emit('retry')">
          {{ $t('podcast.retry') }}
        </ButtonTwoTone>
      </div>
      <CoverRowSkeleton
        v-else-if="feed.loadingFeed && !podcasts.items.length"
        :count="5"
      />
      <CoverRow
        v-else
        type="podcast"
        :items="podcasts.items"
        sub-text="none"
        :show-play-button="false"
      />
    </template>

    <!-- 每日推荐 / 私人FM 卡片 -->
    <DailyTracksCard v-else-if="id === 'dailyTracks'" />
    <FMCard v-else-if="id === 'personalFM'" />

    <!-- 推荐艺人 -->
    <template v-else-if="id === 'recommendArtists'">
      <CoverRowSkeleton
        v-if="feed.loadingFeed && !recommendArtists.length"
        :count="6"
        :columns="6"
        circle
      />
      <CoverRow
        v-else
        type="artist"
        :column-number="6"
        :items="recommendArtists"
      />
    </template>

    <!-- 新碟上架 -->
    <template v-else-if="id === 'newAlbums'">
      <CoverRowSkeleton
        v-if="feed.loadingFeed && !newReleasesAlbum.length"
        :count="5"
      />
      <CoverRow
        v-else
        type="album"
        :items="newReleasesAlbum"
        sub-text="artist"
      />
    </template>

    <!-- 排行榜 -->
    <template v-else-if="id === 'toplists'">
      <CoverRowSkeleton v-if="feed.loadingFeed && !topList.length" :count="5" />
      <CoverRow
        v-else
        type="playlist"
        :items="topList"
        sub-text="updateFrequency"
        :image-size="1024"
      />
    </template>
  </div>
</template>

<script>
import { mapState } from 'vuex';
import CoverRow from '@/components/CoverRow.vue';
import CoverRowSkeleton from '@/components/CoverRowSkeleton.vue';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import DailyTracksCard from '@/components/DailyTracksCard.vue';
import FMCard from '@/components/FMCard.vue';

/**
 * 首页功能卡片。每张卡片是一个独立单元，
 * 通过 设置 → 界面布局 放置到首页栏目或音乐库中。
 * 卡片自身负责根据数据决定可见性（无内容时隐藏，与数据加载前显示骨架屏）。
 */
export default {
  name: 'HomeWidget',
  components: {
    CoverRow,
    CoverRowSkeleton,
    ButtonTwoTone,
    DailyTracksCard,
    FMCard,
  },
  props: {
    /** 卡片 id，见 @/utils/uiLayout 的 HOME_WIDGET_DEFS */
    id: { type: String, required: true },
    /** 首页数据（由 home.vue 统一加载后传入） */
    feed: { type: Object, default: () => ({}) },
    /** 是否为第一个区块（控制首行上边距） */
    first: Boolean,
    /** 放在栏目内部时不渲染标题行 */
    bare: Boolean,
  },
  emits: ['retry'],
  computed: {
    ...mapState(['settings']),
    recommendPlaylist() {
      return this.feed.recommendPlaylist || [];
    },
    podcasts() {
      return this.feed.podcasts || { error: false, items: [] };
    },
    recommendArtists() {
      return this.feed.recommendArtists || [];
    },
    newReleasesAlbum() {
      return this.feed.newReleasesAlbum || [];
    },
    topList() {
      return this.feed.topList || [];
    },
    isCard() {
      return this.id === 'dailyTracks' || this.id === 'personalFM';
    },
    /** 卡片是否有内容（无内容时整个区块隐藏） */
    isVisible() {
      const loading = this.feed.loadingFeed;
      switch (this.id) {
        case 'appleMusic':
          return this.settings.showPlaylistsByAppleMusic !== false;
        case 'recommendPlaylist':
          return loading || this.recommendPlaylist.length > 0;
        case 'podcasts':
          return (
            loading || this.podcasts.error || this.podcasts.items.length > 0
          );
        case 'recommendArtists':
          return loading || this.recommendArtists.length > 0;
        case 'newAlbums':
          return loading || this.newReleasesAlbum.length > 0;
        case 'toplists':
          return loading || this.topList.length > 0;
        default:
          // 每日推荐 / 私人FM 卡片始终显示
          return true;
      }
    },
    hasTitle() {
      return !this.isCard;
    },
    titleText() {
      switch (this.id) {
        case 'appleMusic':
          return 'by Apple Music';
        case 'recommendPlaylist':
          return this.$t('home.recommendPlaylist');
        case 'podcasts':
          return this.$t('podcast.title');
        case 'recommendArtists':
          return this.$t('home.recommendArtist');
        case 'newAlbums':
          return this.$t('home.newAlbum');
        case 'toplists':
          return this.$t('home.charts');
        default:
          return '';
      }
    },
    seeMoreLink() {
      switch (this.id) {
        case 'recommendPlaylist':
          return '/explore?category=推荐歌单';
        case 'newAlbums':
          return '/new-album';
        case 'toplists':
          return '/explore?category=排行榜';
        default:
          return null;
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

.index-row.bare {
  min-height: 0;
  margin-top: 0;
}

.index-row.first-row {
  margin-top: 32px;
}

.index-row.bare.first-row {
  margin-top: 0;
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

  .index-row.bare,
  .index-row.bare.first-row {
    margin-top: 0;
  }

  .title {
    margin-bottom: 16px;
    font-size: 22px;
  }
}
</style>

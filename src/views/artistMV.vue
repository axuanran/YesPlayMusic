<template>
  <div v-show="show || loadError">
    <div v-if="loadError" class="load-error" role="status">
      <span>{{ $t('artist.loadFailed') }}</span>
      <ButtonTwoTone color="grey" @click="loadData">{{
        $t('explore.retry')
      }}</ButtonTwoTone>
    </div>
    <template v-else>
      <h1>
        <img
          class="avatar"
          :src="resizeImage(artist.img1v1Url, 1024)"
          loading="lazy"
        />{{ artist.name }}'s Music Videos
      </h1>
      <MvRow :mvs="mvs" subtitle="publishTime" />
      <div class="load-more">
        <ButtonTwoTone
          v-show="hasMore"
          color="grey"
          :disabled="loadingMore"
          @click="loadMVs"
          >{{ $t('explore.loadMore') }}</ButtonTwoTone
        >
      </div>
    </template>
  </div>
</template>

<script>
import { artistMv, getArtist } from '@/api/artist';
import NProgress from 'nprogress';
import { createRequestGeneration } from '@/utils/requestGeneration';

import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import MvRow from '@/components/MvRow.vue';

export default {
  name: 'ArtistMV',
  components: {
    MvRow,
    ButtonTwoTone,
  },
  beforeRouteUpdate(to, from, next) {
    this.id = to.params.id;
    this.loadData();
    next();
  },
  data() {
    return {
      id: 0,
      show: false,
      hasMore: true,
      loadError: false,
      artist: {},
      mvs: [],
      loadingMore: false,
      requestGeneration: createRequestGeneration(),
      progressTimer: null,
    };
  },
  created() {
    this.id = this.$route.params.id;
    this.loadData();
  },
  activated() {
    if (this.$route.params.id !== this.id) {
      this.id = this.$route.params.id;
      this.mvs = [];
      this.artist = {};
      this.show = false;
      this.hasMore = true;
      this.loadData();
    }
  },
  beforeUnmount() {
    this.requestGeneration.invalidate();
    clearTimeout(this.progressTimer);
    NProgress.done();
  },
  methods: {
    loadData() {
      const requestId = this.requestGeneration.next();
      clearTimeout(this.progressTimer);
      this.show = false;
      this.loadError = false;
      this.hasMore = true;
      this.mvs = [];
      this.progressTimer = setTimeout(() => {
        if (this.requestGeneration.isCurrent(requestId) && !this.show) {
          NProgress.start();
        }
      }, 1000);

      Promise.all([
        getArtist(this.id),
        artistMv({ id: this.id, limit: 100, offset: 0 }),
      ])
        .then(([artistData, mvData]) => {
          if (!this.requestGeneration.isCurrent(requestId)) return;
          this.artist = artistData.artist;
          this.mvs = mvData.mvs;
          this.hasMore = mvData.hasMore;
          this.show = true;
        })
        .catch(error => {
          if (!this.requestGeneration.isCurrent(requestId)) return;
          console.error('[artist-mv] Failed to load artist videos', error);
          this.loadError = true;
        })
        .finally(() => {
          if (!this.requestGeneration.isCurrent(requestId)) return;
          clearTimeout(this.progressTimer);
          this.progressTimer = null;
          NProgress.done();
        });
    },
    loadMVs() {
      if (this.loadingMore || !this.hasMore) return;
      const requestId = this.requestGeneration.current();
      this.loadingMore = true;
      artistMv({ id: this.id, limit: 100, offset: this.mvs.length })
        .then(data => {
          if (!this.requestGeneration.isCurrent(requestId)) return;
          this.mvs.push(...data.mvs);
          this.hasMore = data.hasMore;
        })
        .catch(error => {
          if (this.requestGeneration.isCurrent(requestId)) {
            console.error('[artist-mv] Failed to load more videos', error);
          }
        })
        .finally(() => {
          if (this.requestGeneration.isCurrent(requestId)) {
            this.loadingMore = false;
          }
        });
    },
  },
};
</script>

<style lang="scss" scoped>
h1 {
  font-size: 42px;
  color: var(--color-text);
  .avatar {
    height: 44px;
    margin-right: 12px;
    vertical-align: -7px;
    border-radius: 50%;
    border: rgba(0, 0, 0, 0.2);
  }
}
.load-more {
  display: flex;
  justify-content: center;
}
.load-error {
  min-height: 40vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--color-secondary);
}
</style>

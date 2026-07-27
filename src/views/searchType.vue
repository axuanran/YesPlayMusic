<template>
  <div v-show="show" class="search">
    <h1>
      <span>{{ $t('search.searchFor') }} {{ typeNameTable[type] }}</span> "{{
        keywords
      }}"
    </h1>

    <div v-if="type === 'artists'">
      <CoverRow type="artist" :items="result" :column-number="6" />
    </div>
    <div v-if="type === 'albums'">
      <CoverRow
        type="album"
        :items="result"
        sub-text="artist"
        sub-text-font-size="14px"
      />
    </div>
    <div v-if="type === 'tracks'">
      <TrackList
        :tracks="result"
        type="playlist"
        dbclick-track-func="playAList"
      />
    </div>
    <div v-if="type === 'musicVideos'">
      <MvRow :mvs="result" />
    </div>
    <div v-if="type === 'playlists'">
      <CoverRow type="playlist" :items="result" sub-text="title" />
    </div>
    <div v-if="type === 'podcasts'">
      <CoverRow
        type="podcast"
        :items="result"
        sub-text="none"
        :show-play-button="false"
      />
    </div>

    <div class="load-more">
      <ButtonTwoTone v-show="hasMore" color="grey" @click="fetchData">{{
        $t('explore.loadMore')
      }}</ButtonTwoTone>
    </div>
  </div>
</template>

<script>
import { getTrackDetail } from '@/api/track';
import { search } from '@/api/others';
import NProgress from 'nprogress';
import { getSearchTypeCode, normalizeSearchType } from '@/utils/searchType';

import TrackList from '@/components/TrackList.vue';
import MvRow from '@/components/MvRow.vue';
import CoverRow from '@/components/CoverRow.vue';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';

export default {
  name: 'Search',
  components: {
    TrackList,
    MvRow,
    CoverRow,
    ButtonTwoTone,
  },
  data() {
    return { show: false, result: [], hasMore: true };
  },
  computed: {
    keywords() {
      return this.$route.params.keywords;
    },
    type() {
      return normalizeSearchType(this.$route.params.type);
    },
    typeNameTable() {
      return {
        musicVideos: this.$t('search.mv'),
        tracks: this.$t('search.song'),
        albums: this.$t('search.album'),
        artists: this.$t('search.artist'),
        playlists: this.$t('search.playlist'),
        podcasts: this.$t('search.podcast'),
      };
    },
  },
  watch: {
    '$route.fullPath'() {
      if (this.$route.name !== 'searchType') return;
      this.result = [];
      this.hasMore = true;
      this.show = false;
      this.fetchData();
    },
  },
  created() {
    this.fetchData();
  },
  methods: {
    fetchData() {
      const keywords = this.keywords;
      const type = this.type;
      const typeCode = getSearchTypeCode(type);
      if (typeof keywords !== 'string' || !typeCode) {
        this.show = false;
        NProgress.done();
        return Promise.resolve();
      }
      return search({
        keywords,
        type: typeCode,
        offset: this.result.length,
      }).then(response => {
        if (this.keywords !== keywords || this.type !== type) return;
        const result = response?.result ?? {};
        this.hasMore = result.hasMore ?? true;
        switch (type) {
          case 'musicVideos':
            this.result.push(...(result.mvs ?? []));
            if (result.mvCount <= this.result.length) {
              this.hasMore = false;
            }
            break;
          case 'artists':
            this.result.push(...(result.artists ?? []));
            break;
          case 'albums':
            this.result.push(...(result.albums ?? []));
            if (result.albumCount <= this.result.length) {
              this.hasMore = false;
            }
            break;
          case 'tracks':
            this.result.push(...(result.songs ?? []));
            this.getTracksDetail();
            break;
          case 'playlists':
            this.result.push(...(result.playlists ?? []));
            break;
          case 'podcasts':
            this.result.push(...(result.djRadios ?? []));
            if (result.djRadiosCount <= this.result.length) {
              this.hasMore = false;
            }
            break;
        }
        NProgress.done();
        this.show = true;
      });
    },
    getTracksDetail() {
      const trackIDs = this.result.map(t => t.id);
      if (trackIDs.length === 0) return;
      getTrackDetail(trackIDs.join(',')).then(result => {
        this.result = result.songs;
      });
    },
  },
};
</script>

<style lang="scss" scoped>
h1 {
  margin-top: 32px;
  margin-bottom: 28px;
  color: var(--color-text);
  span {
    opacity: 0.58;
  }
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

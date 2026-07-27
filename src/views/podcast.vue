<template>
  <div class="podcast-page">
    <template v-if="!podcastId">
      <h1>{{ $t('podcast.title') }}</h1>
      <p class="page-description">{{ $t('podcast.description') }}</p>

      <div v-if="error" class="state-panel">
        <span>{{ $t('podcast.loadFailed') }}</span>
        <ButtonTwoTone color="grey" @click="loadRecommendations">
          {{ $t('podcast.retry') }}
        </ButtonTwoTone>
      </div>
      <CoverRow
        v-else
        type="podcast"
        :items="podcasts"
        sub-text="none"
        :show-play-button="false"
      />
    </template>

    <template v-else>
      <div v-if="error" class="state-panel">
        <span>{{ $t('podcast.loadFailed') }}</span>
        <ButtonTwoTone color="grey" @click="loadPodcast">
          {{ $t('podcast.retry') }}
        </ButtonTwoTone>
      </div>
      <template v-else-if="podcast.id">
        <div class="podcast-info">
          <Cover
            :id="podcast.id"
            :image-url="resizeImage(podcast.picUrl, 1024)"
            type="podcast"
            :cover-hover="false"
            :fixed-size="288"
            :always-show-shadow="true"
            :always-show-play-button="false"
          />
          <div class="info">
            <div class="category">{{ podcast.category }}</div>
            <h1>{{ podcast.name }}</h1>
            <div class="creator">{{ podcast.dj?.nickname }}</div>
            <div class="metadata">
              {{
                $t('podcast.episodeCount', {
                  count: podcast.programCount || tracks.length,
                })
              }}
            </div>
            <p class="description">{{ podcast.desc }}</p>
            <ButtonTwoTone
              icon-class="play"
              :disabled="tracks.length === 0"
              @click="playPodcast()"
            >
              {{ $t('podcast.playAll') }}
            </ButtonTwoTone>
          </div>
        </div>

        <h2>{{ $t('podcast.episodes') }}</h2>
        <TrackList
          :id="Number(podcast.id)"
          :tracks="tracks"
          type="album"
          dbclick-track-func="playPodcast"
          :album-object="{ artist: { name: '' } }"
        />
        <div v-if="hasMore" class="load-more">
          <ButtonTwoTone color="grey" :loading="loadingMore" @click="loadMore">
            {{ $t('podcast.loadMore') }}
          </ButtonTwoTone>
        </div>
      </template>
    </template>
  </div>
</template>

<script>
import NProgress from 'nprogress';
import {
  getPodcastDetail,
  getPodcastPrograms,
  getRecommendedPodcasts,
} from '@/api/podcast';
import { normalizePodcastPrograms } from '@/utils/podcast';

import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import Cover from '@/components/Cover.vue';
import CoverRow from '@/components/CoverRow.vue';
import TrackList from '@/components/TrackList.vue';

const PAGE_SIZE = 100;

export default {
  name: 'Podcast',
  components: {
    ButtonTwoTone,
    Cover,
    CoverRow,
    TrackList,
  },
  beforeRouteUpdate(to, _from, next) {
    next();
    this.reset();
    this.loadData(to.params.id);
  },
  data() {
    return {
      podcastId: '',
      podcasts: [],
      podcast: {},
      tracks: [],
      error: false,
      hasMore: false,
      loadingMore: false,
      programOffset: 0,
    };
  },
  created() {
    this.loadData(this.$route.params.id);
  },
  methods: {
    reset() {
      this.podcasts = [];
      this.podcast = {};
      this.tracks = [];
      this.error = false;
      this.hasMore = false;
      this.loadingMore = false;
      this.programOffset = 0;
    },
    loadData(id) {
      this.podcastId = id || '';
      if (this.podcastId) {
        this.loadPodcast();
      } else {
        this.loadRecommendations();
      }
    },
    async loadRecommendations() {
      this.error = false;
      NProgress.start();
      try {
        const data = await getRecommendedPodcasts();
        this.podcasts = Array.isArray(data?.djRadios) ? data.djRadios : [];
      } catch {
        this.error = true;
      } finally {
        NProgress.done();
      }
    },
    async loadPodcast() {
      this.error = false;
      NProgress.start();
      try {
        const [detailData, programData] = await Promise.all([
          getPodcastDetail(this.podcastId),
          getPodcastPrograms({ id: this.podcastId, limit: PAGE_SIZE }),
        ]);
        this.podcast = detailData?.data || {};
        this.tracks = normalizePodcastPrograms(
          programData?.programs,
          this.podcast
        );
        this.programOffset = programData?.programs?.length || 0;
        this.hasMore = programData?.more === true;
      } catch {
        this.error = true;
      } finally {
        NProgress.done();
      }
    },
    async loadMore() {
      if (this.loadingMore) return;
      this.loadingMore = true;
      try {
        const data = await getPodcastPrograms({
          id: this.podcastId,
          limit: PAGE_SIZE,
          offset: this.programOffset,
        });
        this.tracks.push(
          ...normalizePodcastPrograms(data?.programs, this.podcast)
        );
        this.programOffset += data?.programs?.length || 0;
        this.hasMore = data?.more === true;
      } catch {
        this.error = true;
      } finally {
        this.loadingMore = false;
      }
    },
    playPodcast(trackID = 'first') {
      if (this.tracks.length === 0) return;
      this.$store.state.player.replacePlaylist(
        this.tracks.map(track => track.id),
        this.podcast.id,
        'podcast',
        trackID
      );
    },
  },
};
</script>

<style lang="scss" scoped>
.podcast-page {
  padding-top: 32px;
  color: var(--color-text);
}

h1 {
  margin: 0;
  font-size: 56px;
}

.page-description {
  margin: 12px 0 32px;
  opacity: 0.68;
  font-size: 18px;
}

.podcast-info {
  display: flex;
  width: 78vw;
  margin-bottom: 64px;

  .info {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    margin-left: 56px;
  }

  .category,
  .metadata {
    opacity: 0.58;
    font-size: 14px;
  }

  .creator {
    margin-top: 12px;
    font-size: 18px;
    font-weight: 600;
  }

  .description {
    display: -webkit-box;
    overflow: hidden;
    margin: 22px 0 28px;
    opacity: 0.68;
    line-height: 1.6;
    white-space: pre-line;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
  }
}

h2 {
  margin-bottom: 20px;
  font-size: 28px;
}

.state-panel {
  display: flex;
  min-height: 240px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 18px;
  color: var(--color-text);
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 32px 0 64px;
}

@media (max-width: 900px) {
  .podcast-info {
    width: 100%;
  }

  .podcast-info .info {
    margin-left: 32px;
  }

  .podcast-info h1 {
    font-size: 40px;
  }
}
</style>

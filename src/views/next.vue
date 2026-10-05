<template>
  <div class="next-tracks">
    <section aria-labelledby="queue-now-playing">
      <h1 id="queue-now-playing">{{ $t('next.nowPlaying') }}</h1>
      <TrackList
        :tracks="[currentTrack]"
        :type="queueTrackType"
        dbclick-track-func="none"
      />
    </section>

    <section v-if="playNextList.length > 0" aria-labelledby="queue-play-next">
      <div class="section-heading">
        <h1 id="queue-play-next">{{ $t('next.playNext') }}</h1>
        <button type="button" @click="player.clearPlayNextList()">{{
          $t('next.clearQueue')
        }}</button>
      </div>
      <TrackList
        :tracks="playNextTracks"
        :type="queueTrackType"
        :highlight-playing-track="false"
        dbclick-track-func="playTrackOnListByID"
        item-key="id+index"
        :extra-context-menu-item="['removeTrackFromQueue']"
      />
    </section>

    <section aria-labelledby="queue-next-up">
      <h1 id="queue-next-up">{{ $t('next.nextUp') }}</h1>
      <div
        v-if="loading && filteredTracks.length === 0"
        class="queue-status"
        role="status"
      >
        <span class="status-spinner" aria-hidden="true"></span>
        {{ $t('next.loading') }}
      </div>
      <div
        v-else-if="loadError && filteredTracks.length === 0"
        class="queue-status queue-status-error"
        role="alert"
      >
        <span>{{ $t('next.loadFailed') }}</span>
        <button type="button" @click="loadTracks">{{
          $t('next.retry')
        }}</button>
      </div>
      <div
        v-else-if="!loading && filteredTracks.length === 0"
        class="queue-status"
      >
        {{ $t('next.empty') }}
      </div>
      <template v-else>
        <div v-if="loadError" class="partial-error" role="status">
          {{ $t('next.partialFailure') }}
          <button type="button" @click="loadTracks">{{
            $t('next.retry')
          }}</button>
        </div>
        <TrackList
          :tracks="filteredTracks"
          :type="queueTrackType"
          :highlight-playing-track="false"
          dbclick-track-func="playTrackOnListByID"
        />
      </template>
    </section>
  </div>
</template>

<script>
import { mapState, mapActions } from 'vuex';
import { getTrackDetail } from '@/api/track';
import TrackList from '@/components/TrackList.vue';
import { createRequestGeneration } from '@/utils/requestGeneration';
import {
  collectQueueTrackIds,
  getMissingTrackIds,
  retainQueueTracks,
} from '@/utils/queueTracks';

export default {
  name: 'Next',
  components: {
    TrackList,
  },
  data() {
    return {
      tracks: [],
      loading: false,
      loadError: false,
      loadPromise: null,
      loadQueued: false,
      trackLoadGeneration: createRequestGeneration(),
    };
  },
  computed: {
    ...mapState(['player']),
    currentTrack() {
      return this.player.displayTrack;
    },
    playerShuffle() {
      return this.player.shuffle;
    },
    queueTrackType() {
      if (this.currentTrack?.local) return 'localMusic';
      if (this.currentTrack?.streaming) return 'streaming';
      return 'playlist';
    },
    desiredTrackIds() {
      return collectQueueTrackIds(
        this.player.list,
        this.player.current,
        this.playNextList
      );
    },
    trackLookup() {
      return new Map(this.tracks.map(track => [track.id, track]));
    },
    filteredTracks() {
      return this.player.list
        .slice(this.player.current + 1, this.player.current + 101)
        .map(id => this.trackLookup.get(id))
        .filter(Boolean);
    },
    playNextList() {
      return this.player.playNextList;
    },
    playNextTracks() {
      return this.playNextList
        .map(id => this.trackLookup.get(id))
        .filter(Boolean);
    },
  },
  watch: {
    currentTrack() {
      this.loadTracks();
    },
    playerShuffle() {
      this.loadTracks();
    },
    playNextList: {
      deep: true,
      handler() {
        this.loadTracks();
      },
    },
  },
  activated() {
    this.loadTracks();
    this.$parent?.$refs?.scrollbar?.restorePosition?.();
  },
  deactivated() {
    this.trackLoadGeneration.invalidate();
    this.loadQueued = false;
  },
  beforeUnmount() {
    this.trackLoadGeneration.invalidate();
    this.loadQueued = false;
  },
  methods: {
    ...mapActions(['playTrackOnListByID']),
    resolveLocalTracks(ids) {
      return Promise.all(
        ids.map(id => window.electronAPI?.localMusic?.get(id))
      ).then(tracks => tracks.filter(Boolean));
    },
    resolveStreamingTracks(ids) {
      return Promise.all(
        ids.map(id => window.electronAPI?.streaming?.getTrack(id))
      ).then(tracks => tracks.filter(Boolean));
    },
    resolveRemoteTracks(ids) {
      if (ids.length === 0) return Promise.resolve([]);
      return getTrackDetail(ids.join(',')).then(data => data.songs ?? []);
    },
    loadTracks() {
      if (this.loadPromise) {
        this.loadQueued = true;
        return this.loadPromise;
      }
      const requestId = this.trackLoadGeneration.next();

      const desiredTrackIds = this.desiredTrackIds;
      const missingTrackIds = getMissingTrackIds(desiredTrackIds, this.tracks);
      const localTrackIds = missingTrackIds.filter(
        id => typeof id === 'string' && id.startsWith('local:')
      );
      const streamingTrackIds = missingTrackIds.filter(
        id => typeof id === 'string' && id.startsWith('stream:')
      );
      const remoteTrackIds = missingTrackIds.filter(
        id =>
          !(
            typeof id === 'string' &&
            (id.startsWith('local:') || id.startsWith('stream:'))
          )
      );

      this.loading = true;
      this.loadError = false;
      const loadPromise = Promise.allSettled([
        this.resolveLocalTracks(localTrackIds),
        this.resolveStreamingTracks(streamingTrackIds),
        this.resolveRemoteTracks(remoteTrackIds),
      ])
        .then(results => {
          if (!this.trackLoadGeneration.isCurrent(requestId)) return;
          const loadedTracks = results
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value);
          const currentTrackIds = this.desiredTrackIds;
          this.tracks = retainQueueTracks(
            this.tracks,
            loadedTracks,
            currentTrackIds
          );
          this.loadError =
            results.some(result => result.status === 'rejected') ||
            (missingTrackIds.length > 0 &&
              loadedTracks.length < missingTrackIds.length);
        })
        .finally(() => {
          if (this.loadPromise !== loadPromise) return;
          this.loadPromise = null;
          this.loading = false;
          if (this.loadQueued) {
            this.loadQueued = false;
            this.loadTracks();
          }
        });
      this.loadPromise = loadPromise;
      return loadPromise;
    },
  },
};
</script>

<style lang="scss" scoped>
.next-tracks {
  padding-bottom: 24px;
}

section + section {
  margin-top: 36px;
}

h1 {
  margin: 0 0 18px;
  color: var(--color-text);
  cursor: default;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  button {
    min-height: 34px;
    padding: 0 14px;
    color: var(--color-text);
    border-radius: 9px;
    opacity: 0.68;
    font-weight: 500;
    transition:
      opacity 0.2s,
      background-color 0.2s,
      transform 0.2s;

    &:hover,
    &:focus-visible {
      opacity: 1;
      background: var(--color-secondary-bg);
    }

    &:active {
      transform: scale(0.94);
    }
  }
}

.queue-status {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-secondary);
  text-align: center;
}

.queue-status-error {
  flex-direction: column;

  button {
    min-height: 36px;
    padding: 0 18px;
    border-radius: 10px;
    color: var(--color-text);
    background: var(--color-secondary-bg);
  }
}

.status-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid color-mix(in srgb, var(--color-text) 18%, transparent);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: queue-spin 0.8s linear infinite;
}

.partial-error {
  margin-bottom: 12px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: var(--color-text-secondary);
  background: var(--color-secondary-bg);
  border-radius: 10px;

  button {
    color: var(--color-primary);
    font-weight: 600;
  }
}

@keyframes queue-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  section + section {
    margin-top: 28px;
  }

  .section-heading button,
  .queue-status-error button {
    min-height: 44px;
  }
}
</style>

<template>
  <Modal
    class="cached-tracks-modal"
    :show="show"
    :close="close"
    :title="$t('cachedTracks.title')"
    width="34rem"
    min-width="calc(min(34rem, 92vw))"
  >
    <template #default>
      <div v-if="loading" class="status">{{ $t('cachedTracks.loading') }}</div>
      <div v-else-if="tracks.length === 0" class="status">
        {{ $t('cachedTracks.empty') }}
      </div>
      <div v-else class="track-list">
        <div
          v-for="track in tracks"
          :key="track.cacheKey || track.id"
          class="track"
        >
          <img
            v-if="track.cover"
            :src="resizeImage(track.cover, 112)"
            loading="lazy"
          />
          <div v-else class="cover-placeholder"></div>
          <div class="info">
            <div class="name">
              {{ track.name }}
              <span v-if="!track.completed" class="partial">
                {{ $t('cachedTracks.partial') }}
              </span>
            </div>
            <div class="metadata">
              {{ track.artists.join(', ') || $t('cachedTracks.unknownArtist') }}
              <span v-if="track.album"> · {{ track.album }}</span>
              <span v-if="track.quality"> · {{ track.quality }}</span>
            </div>
          </div>
          <button
            :disabled="!track.completed"
            :title="
              $t(
                track.completed
                  ? 'cachedTracks.play'
                  : 'cachedTracks.partialCannotPlay'
              )
            "
            @click="play(track)"
          >
            {{ $t('cachedTracks.play') }}
          </button>
          <button
            class="remove"
            :disabled="removingIds.includes(track.cacheKey || track.id)"
            :title="$t('cachedTracks.remove')"
            @click="remove(track)"
          >
            {{ $t('cachedTracks.remove') }}
          </button>
        </div>
      </div>
    </template>
    <template #footer>
      <button @click="close">{{ $t('cachedTracks.close') }}</button>
    </template>
  </Modal>
</template>

<script>
import { mapActions, mapMutations, mapState } from 'vuex';
import Modal from '@/components/Modal.vue';
import {
  listCachedTracks,
  onTrackCacheChanged,
  removeCachedTrack,
} from '@/utils/db';
import { isCapacitor } from '@/utils/env';

function normalizeNativeTrack(track = {}) {
  const numericId = Number(track.id);
  return {
    id: Number.isFinite(numericId) ? numericId : track.id,
    cacheKey: track.cacheKey || '',
    name: track.title || (track.id ? `#${track.id}` : ''),
    artists: track.artist ? [track.artist] : [],
    album: track.album || '',
    cover: track.artwork || '',
    quality: track.quality || '',
    bytes: Number(track.bytes) || 0,
    contentLength: Number(track.contentLength) || 0,
    completed: track.completed !== false,
  };
}

export default {
  name: 'ModalCachedTracks',
  components: { Modal },
  data() {
    return {
      tracks: [],
      loading: false,
      loadPromise: null,
      loadQueued: false,
      removingIds: [],
      removeCacheListener: null,
      nativeCacheListener: null,
    };
  },
  computed: {
    ...mapState(['modals', 'player']),
    show: {
      get() {
        return this.modals.cachedTracksModal.show;
      },
      set(value) {
        this.updateModal({
          modalName: 'cachedTracksModal',
          key: 'show',
          value,
        });
      },
    },
  },
  watch: {
    show: {
      immediate: true,
      handler(value) {
        if (value) this.load();
      },
    },
  },
  mounted() {
    if (isCapacitor) {
      this.bindNativeCacheListener();
      return;
    }
    this.removeCacheListener = onTrackCacheChanged(() => {
      if (this.show) this.load();
    });
  },
  beforeUnmount() {
    this.removeCacheListener?.();
    this.nativeCacheListener?.remove?.();
  },
  methods: {
    ...mapMutations(['updateModal']),
    ...mapActions(['showToast']),
    close() {
      this.show = false;
    },
    async getNativeAudioPlugin() {
      const { BackgroundAudio } = await import('@/mobile/AndroidAudioEngine');
      return BackgroundAudio;
    },
    async bindNativeCacheListener() {
      try {
        const plugin = await this.getNativeAudioPlugin();
        this.nativeCacheListener = await plugin.addListener(
          'cacheChanged',
          () => {
            if (this.show) this.load();
          }
        );
      } catch (error) {
        console.error('[android-audio-cache] failed to listen', error);
      }
    },
    async load() {
      if (this.loadPromise) {
        this.loadQueued = true;
        return this.loadPromise;
      }

      this.loading = true;
      this.loadPromise = (async () => {
        do {
          this.loadQueued = false;
          try {
            if (isCapacitor) {
              const plugin = await this.getNativeAudioPlugin();
              const result = await plugin.listCachedTracks();
              this.tracks = (result?.tracks || []).map(normalizeNativeTrack);
            } else {
              this.tracks = await listCachedTracks();
            }
          } catch (error) {
            console.error('[track-cache] failed to list cached tracks', error);
            this.showToast(this.$t('cachedTracks.loadFailed'));
          }
        } while (this.loadQueued && this.show);
      })();

      try {
        await this.loadPromise;
      } finally {
        this.loadPromise = null;
        this.loadQueued = false;
        this.loading = false;
      }
    },
    play(track) {
      if (!track.completed) return;
      this.player.addTrackToPlayNext(track.id, true);
      this.close();
    },
    async remove(track) {
      const removeId = track.cacheKey || track.id;
      if (this.removingIds.includes(removeId)) return;
      this.removingIds.push(removeId);
      try {
        if (isCapacitor) {
          if (!track.cacheKey) throw new Error('Native cache key is missing');
          const plugin = await this.getNativeAudioPlugin();
          await plugin.removeCache({ cacheKey: track.cacheKey });
        } else {
          await removeCachedTrack(track.id);
        }
        this.tracks = this.tracks.filter(
          item => (item.cacheKey || item.id) !== removeId
        );
      } catch (error) {
        console.error(`[track-cache] failed to remove ${track.id}`, error);
        this.showToast(this.$t('cachedTracks.removeFailed'));
      } finally {
        this.removingIds = this.removingIds.filter(id => id !== removeId);
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.status {
  padding: 36px 0;
  text-align: center;
  opacity: 0.68;
}

.track-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 8px;

  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }

  img,
  .cover-placeholder {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--color-secondary-bg-for-transparent);
  }

  .info {
    min-width: 0;
    flex: 1;
  }

  .name,
  .metadata {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 600;
  }

  .metadata {
    margin-top: 3px;
    font-size: 12px;
    opacity: 0.68;
  }

  .partial {
    display: inline-block;
    margin-left: 4px;
    border-radius: 4px;
    padding: 1px 4px;
    color: #b26a00;
    background: rgba(255, 166, 0, 0.16);
    font-size: 10px;
    vertical-align: 1px;
  }

  button {
    flex: 0 0 auto;
    padding: 6px 9px;
    border-radius: 6px;
    color: var(--color-text);
    background: var(--color-secondary-bg-for-transparent);
  }

  button.remove {
    color: #d33a31;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}
</style>

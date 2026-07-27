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
        <div v-for="track in tracks" :key="track.id" class="track">
          <img
            v-if="track.cover"
            :src="resizeImage(track.cover, 112)"
            loading="lazy"
          />
          <div v-else class="cover-placeholder"></div>
          <div class="info">
            <div class="name">{{ track.name }}</div>
            <div class="metadata">
              {{ track.artists.join(', ') || $t('cachedTracks.unknownArtist') }}
              <span v-if="track.album"> · {{ track.album }}</span>
            </div>
          </div>
          <button :title="$t('cachedTracks.play')" @click="play(track)">
            {{ $t('cachedTracks.play') }}
          </button>
          <button
            class="remove"
            :disabled="removingIds.includes(track.id)"
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

export default {
  name: 'ModalCachedTracks',
  components: { Modal },
  data() {
    return {
      tracks: [],
      loading: false,
      removingIds: [],
      removeCacheListener: null,
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
    show(value) {
      if (value) this.load();
    },
  },
  mounted() {
    this.removeCacheListener = onTrackCacheChanged(() => {
      if (this.show) this.load();
    });
  },
  beforeUnmount() {
    this.removeCacheListener?.();
  },
  methods: {
    ...mapMutations(['updateModal']),
    ...mapActions(['showToast']),
    close() {
      this.show = false;
    },
    async load() {
      this.loading = true;
      try {
        this.tracks = await listCachedTracks();
      } catch (error) {
        console.error('[track-cache] failed to list cached tracks', error);
        this.showToast(this.$t('cachedTracks.loadFailed'));
      } finally {
        this.loading = false;
      }
    },
    play(track) {
      this.player.addTrackToPlayNext(track.id, true);
      this.close();
    },
    async remove(track) {
      if (this.removingIds.includes(track.id)) return;
      this.removingIds.push(track.id);
      try {
        await removeCachedTrack(track.id);
        this.tracks = this.tracks.filter(item => item.id !== track.id);
      } catch (error) {
        console.error(`[track-cache] failed to remove ${track.id}`, error);
        this.showToast(this.$t('cachedTracks.removeFailed'));
      } finally {
        this.removingIds = this.removingIds.filter(id => id !== track.id);
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

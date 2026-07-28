<template>
  <Modal
    class="download-track-modal"
    :show="show"
    :close="close"
    :title="modalTitle"
    width="28rem"
    min-width="calc(min(28rem, 92vw))"
  >
    <template #default>
      <div v-if="isPlaylist" class="playlist-info">
        <div class="playlist-name">{{ playlistName }}</div>
        <div class="track-artist">
          {{ $t('downloadTrack.trackCount', { count: tracks.length }) }}
        </div>
      </div>
      <div v-else class="track-info">
        <img
          v-if="track.al?.picUrl"
          :src="resizeImage(track.al.picUrl, 224)"
          loading="lazy"
        />
        <div>
          <div class="track-name">{{ track.name }}</div>
          <div class="track-artist">{{ artistNames }}</div>
        </div>
      </div>
      <label class="quality-field">
        <span>{{ $t('downloadTrack.quality') }}</span>
        <select v-model="quality" :disabled="downloading">
          <option
            v-for="item in qualities"
            :key="item.value"
            :value="item.value"
          >
            {{ $t(`downloadTrack.qualities.${item.value}`) }}
          </option>
        </select>
      </label>
      <div v-if="downloading" class="progress">
        <div class="progress-track">
          <div class="progress-value" :style="{ width: progressPercent }"></div>
        </div>
        <span>{{ progressLabel }}</span>
      </div>
      <div v-if="downloading && isPlaylist" class="batch-progress">
        <span>{{
          $t('downloadTrack.batchProgress', {
            current: currentTrackIndex,
            total: tracks.length,
          })
        }}</span>
        <span class="current-track">{{ currentTrackName }}</span>
        <span v-if="failedTracks > 0">
          {{ $t('downloadTrack.failedCount', { count: failedTracks }) }}
        </span>
      </div>
    </template>
    <template #footer>
      <button :disabled="downloading" @click="close">
        {{ $t('downloadTrack.cancel') }}
      </button>
      <button class="primary" :disabled="downloading" @click="download">
        {{
          downloading
            ? $t('downloadTrack.downloading')
            : $t('downloadTrack.download')
        }}
      </button>
    </template>
  </Modal>
</template>

<script>
import { mapActions, mapMutations, mapState } from 'vuex';
import Modal from '@/components/Modal.vue';
import { getLyric } from '@/api/track';
import { resolveTrackSource } from '@/utils/resolveAudioSource';
import {
  createTrackDownloadFilename,
  createTrackDownloadMetadata,
  normalizeTrackDownloadQuality,
  TRACK_DOWNLOAD_QUALITIES,
} from '@/utils/trackDownload';

function formatBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

export default {
  name: 'ModalDownloadTrack',
  components: { Modal },
  data() {
    return {
      quality: 'exhigh',
      downloading: false,
      receivedBytes: 0,
      totalBytes: 0,
      currentTrackIndex: 0,
      currentTrackName: '',
      completedTracks: 0,
      failedTracks: 0,
      activeBatchId: '',
      removeProgressListener: null,
      qualities: TRACK_DOWNLOAD_QUALITIES,
    };
  },
  computed: {
    ...mapState(['modals', 'settings']),
    show: {
      get() {
        return this.modals.downloadTrackModal.show;
      },
      set(value) {
        this.updateModal({
          modalName: 'downloadTrackModal',
          key: 'show',
          value,
        });
      },
    },
    track() {
      return this.modals.downloadTrackModal.selectedTrack || {};
    },
    tracks() {
      return this.modals.downloadTrackModal.selectedTracks || [];
    },
    playlistName() {
      return this.modals.downloadTrackModal.playlistName || '';
    },
    isPlaylist() {
      return this.tracks.length > 0;
    },
    modalTitle() {
      return this.$t(
        this.isPlaylist ? 'downloadTrack.playlistTitle' : 'downloadTrack.title'
      );
    },
    artistNames() {
      return (this.track.ar || [])
        .map(artist => artist?.name)
        .filter(Boolean)
        .join(', ');
    },
    progressPercent() {
      if (this.totalBytes <= 0) return '100%';
      return `${Math.min(
        100,
        Math.round((this.receivedBytes / this.totalBytes) * 100)
      )}%`;
    },
    progressLabel() {
      if (this.totalBytes <= 0) return formatBytes(this.receivedBytes);
      return `${formatBytes(this.receivedBytes)} / ${formatBytes(
        this.totalBytes
      )}`;
    },
  },
  watch: {
    show(value) {
      if (!value) return;
      this.quality = normalizeTrackDownloadQuality(this.settings.musicQuality);
      this.receivedBytes = 0;
      this.totalBytes = 0;
      this.currentTrackIndex = 0;
      this.currentTrackName = '';
      this.completedTracks = 0;
      this.failedTracks = 0;
      this.activeBatchId = '';
    },
  },
  mounted() {
    this.removeProgressListener =
      window.electronAPI?.download?.onProgress?.(progress => {
        if (!this.downloading) return;
        if (this.activeBatchId && progress?.batchId !== this.activeBatchId) {
          return;
        }
        this.receivedBytes = Math.max(0, Number(progress?.received) || 0);
        this.totalBytes = Math.max(0, Number(progress?.total) || 0);
      }) || null;
  },
  beforeUnmount() {
    this.removeProgressListener?.();
  },
  methods: {
    ...mapMutations(['updateModal']),
    ...mapActions(['showToast']),
    close() {
      if (!this.downloading) this.show = false;
    },
    async download() {
      if (
        this.downloading ||
        (!this.isPlaylist && !this.track?.id) ||
        (this.isPlaylist && this.tracks.length === 0)
      ) {
        return;
      }
      this.downloading = true;
      this.receivedBytes = 0;
      this.totalBytes = 0;
      try {
        if (this.isPlaylist) {
          await this.downloadPlaylist();
        } else {
          await this.downloadSingle();
        }
      } catch (error) {
        this.showToast(
          this.$t('downloadTrack.failed', {
            error: error?.message || String(error),
          })
        );
      } finally {
        this.downloading = false;
      }
    },
    async downloadSingle() {
      const request = await this.createDownloadRequest(this.track);
      const result = await window.electronAPI?.download?.saveTrack?.({
        ...request,
        suggestedName: createTrackDownloadFilename(this.track, this.quality),
      });
      if (result?.status === 'completed') {
        this.showToast(this.$t('downloadTrack.completed'));
        this.show = false;
      }
    },
    async downloadPlaylist() {
      const downloadApi = window.electronAPI?.download;
      const batch = await downloadApi?.beginBatch?.({
        playlistName: this.playlistName,
      });
      if (!batch || batch.status === 'canceled') return;

      this.activeBatchId = batch.batchId;
      this.completedTracks = 0;
      this.failedTracks = 0;
      try {
        for (let index = 0; index < this.tracks.length; index += 1) {
          const track = this.tracks[index];
          this.currentTrackIndex = index + 1;
          this.currentTrackName = track.name || `#${track.id}`;
          this.receivedBytes = 0;
          this.totalBytes = 0;
          try {
            const request = await this.createDownloadRequest(track);
            await downloadApi.saveBatchTrack({
              batchId: batch.batchId,
              index: index + 1,
              totalTracks: this.tracks.length,
              ...request,
              suggestedName: createTrackDownloadFilename(track, this.quality),
            });
            this.completedTracks += 1;
          } catch (error) {
            this.failedTracks += 1;
            console.error(
              `[track-download] failed to download ${track.id}`,
              error
            );
          }
        }
      } finally {
        await downloadApi.finishBatch(batch.batchId);
        this.activeBatchId = '';
      }

      this.showToast(
        this.$t('downloadTrack.batchCompleted', {
          completed: this.completedTracks,
          failed: this.failedTracks,
        })
      );
      this.show = false;
    },
    async createDownloadRequest(track) {
      const [url, lyricResult] = await Promise.all([
        this.resolveDownloadUrl(track),
        getLyric(track.id).catch(() => undefined),
      ]);
      return {
        metadata: createTrackDownloadMetadata(track, lyricResult),
        url,
      };
    },
    async resolveDownloadUrl(track) {
      const url = await resolveTrackSource(track, {
        quality: this.quality,
        bypassCache: true,
      });
      if (!url) throw new Error(this.$t('downloadTrack.sourceUnavailable'));
      return url;
    },
  },
};
</script>

<style lang="scss" scoped>
.track-info {
  display: flex;
  align-items: center;
  margin-bottom: 20px;

  img {
    width: 56px;
    height: 56px;
    margin-right: 14px;
    border-radius: 8px;
    object-fit: cover;
  }
}

.playlist-info {
  margin-bottom: 20px;
}

.playlist-name {
  overflow: hidden;
  font-size: 18px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-name {
  font-size: 16px;
  font-weight: 600;
}

.track-artist {
  margin-top: 4px;
  opacity: 0.68;
}

.quality-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  select {
    min-width: 12rem;
  }
}

.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 20px;
  font-size: 12px;
  opacity: 0.8;
}

.batch-progress {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.68;

  .current-track {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.progress-track {
  flex: 1;
  height: 6px;
  overflow: hidden;
  background: var(--color-secondary-bg-for-transparent);
  border-radius: 999px;
}

.progress-value {
  height: 100%;
  background: var(--color-primary-gradient);
  border-radius: inherit;
  transition: width 0.15s linear;
}

button:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>

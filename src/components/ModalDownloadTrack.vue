<template>
  <Modal
    class="download-track-modal"
    :show="show"
    :close="close"
    :title="$t('downloadTrack.title')"
    width="28rem"
    min-width="calc(min(28rem, 92vw))"
  >
    <template #default>
      <div class="track-info">
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
import { resolveTrackSource } from '@/utils/resolveAudioSource';
import {
  createTrackDownloadFilename,
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
    },
  },
  mounted() {
    this.removeProgressListener =
      window.electronAPI?.download?.onProgress?.(progress => {
        if (!this.downloading) return;
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
      if (this.downloading || !this.track?.id) return;
      this.downloading = true;
      this.receivedBytes = 0;
      this.totalBytes = 0;
      try {
        const url = await resolveTrackSource(this.track, {
          quality: this.quality,
          bypassCache: true,
        });
        if (!url) throw new Error(this.$t('downloadTrack.sourceUnavailable'));
        const result = await window.electronAPI?.download?.saveTrack?.({
          url,
          suggestedName: createTrackDownloadFilename(this.track, this.quality),
        });
        if (result?.status === 'completed') {
          this.showToast(this.$t('downloadTrack.completed'));
          this.show = false;
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

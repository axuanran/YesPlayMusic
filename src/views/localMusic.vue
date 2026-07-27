<template>
  <div class="local-music">
    <div class="header">
      <div>
        <h1>{{ $t('localMusic.title') }}</h1>
        <p>{{ $t('localMusic.description') }}</p>
      </div>
      <div v-if="isElectron" class="actions">
        <button :disabled="tracks.length === 0" @click="playAll">
          <svg-icon icon-class="play" />
          {{ $t('localMusic.playAll') }}
        </button>
        <button class="primary" :disabled="importing" @click="importFiles">
          <svg-icon icon-class="plus" />
          {{ importing ? $t('localMusic.importing') : $t('localMusic.import') }}
        </button>
      </div>
    </div>

    <p v-if="!isElectron" class="empty">{{ $t('localMusic.desktopOnly') }}</p>
    <p v-else-if="loading" class="empty">{{ $t('localMusic.loading') }}</p>
    <p v-else-if="tracks.length === 0" class="empty">
      {{ $t('localMusic.empty') }}
    </p>
    <TrackList
      v-else
      id="local-music"
      :tracks="tracks"
      :column-number="1"
      type="localMusic"
      dbclick-track-func="playLocalMusic"
      :extra-context-menu-item="['removeLocalTrack']"
      @remove-track="removeTrack"
    />
  </div>
</template>

<script>
import { isElectron } from '@/utils/env';
import TrackList from '@/components/TrackList.vue';
import SvgIcon from '@/components/SvgIcon.vue';

export default {
  name: 'LocalMusic',
  components: { SvgIcon, TrackList },
  data() {
    return {
      isElectron,
      importing: false,
      loading: true,
      tracks: [],
    };
  },
  created() {
    this.loadTracks();
  },
  activated() {
    this.loadTracks();
  },
  methods: {
    async loadTracks() {
      if (!this.isElectron || !window.electronAPI?.localMusic) {
        this.loading = false;
        return;
      }
      try {
        this.tracks = await window.electronAPI.localMusic.list();
      } finally {
        this.loading = false;
      }
    },
    async importFiles() {
      if (this.importing) return;
      this.importing = true;
      try {
        const result = await window.electronAPI.localMusic.selectFiles();
        this.tracks = result.tracks;
        if (result.imported || result.skipped) {
          this.$store.dispatch(
            'showToast',
            this.$t('localMusic.importResult', {
              imported: result.imported,
              skipped: result.skipped,
            })
          );
        }
      } finally {
        this.importing = false;
      }
    },
    playAll() {
      if (!this.tracks.length) return;
      this.$store.state.player.replacePlaylist(
        this.tracks.map(track => track.id),
        'local-music',
        'local',
        'first',
        { name: this.$t('localMusic.title') }
      );
    },
    async removeTrack(trackId) {
      this.tracks = await window.electronAPI.localMusic.remove([trackId]);
    },
  },
};
</script>

<style lang="scss" scoped>
.local-music {
  padding-top: 32px;
}

.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 32px;

  h1 {
    margin: 0 0 8px;
    font-size: 42px;
    color: var(--color-text);
  }

  p {
    margin: 0;
    color: var(--color-text);
    opacity: 0.68;
  }
}

.actions {
  display: flex;
  gap: 10px;

  button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    color: var(--color-text);
    background: var(--color-secondary-bg);
    border-radius: 8px;
    font-weight: 600;

    &.primary {
      color: var(--color-primary-bg);
      background: var(--color-primary);
    }

    &:disabled {
      cursor: default;
      opacity: 0.45;
    }
  }

  .svg-icon {
    width: 15px;
    height: 15px;
  }
}

.empty {
  padding: 64px 16px;
  color: var(--color-text);
  text-align: center;
  opacity: 0.58;
}
</style>

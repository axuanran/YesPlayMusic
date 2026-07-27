<template>
  <div v-if="folder" class="local-playlist">
    <div class="playlist-info">
      <Cover
        :id="folder.id"
        :image-url="folderCoverUrl"
        type="playlist"
        :fixed-size="288"
        :cover-hover="false"
        :always-show-shadow="true"
        :click-cover-to-play="true"
        :play-action="playAll"
      />
      <div class="info">
        <div class="title">{{ folder.name }}</div>
        <div class="artist">{{ $t('localMusic.folderPlaylist') }}</div>
        <div class="date-and-count">
          {{ tracks.length }} {{ $t('common.songs') }}
        </div>
        <div class="description">{{ folder.path }}</div>
        <div class="buttons">
          <ButtonTwoTone icon-class="play" @click="playAll">
            {{ $t('common.play') }}
          </ButtonTwoTone>
          <ButtonTwoTone color="grey" @click="refreshFolder">
            {{ $t('localMusic.refresh') }}
          </ButtonTwoTone>
          <ButtonTwoTone color="grey" @click="removeFolder">
            {{ $t('localMusic.removeFolder') }}
          </ButtonTwoTone>
        </div>
      </div>
    </div>

    <p v-if="refreshing" class="empty">{{ $t('localMusic.refreshing') }}</p>
    <p v-else-if="tracks.length === 0" class="empty">
      {{ $t('localMusic.emptyPlaylist') }}
    </p>
    <TrackList
      v-else
      :id="folder.id"
      :tracks="tracks"
      :column-number="1"
      type="localMusic"
      dbclick-track-func="playLocalMusic"
    />
  </div>
  <p v-else class="empty">{{ $t('localMusic.loading') }}</p>
</template>

<script>
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import Cover from '@/components/Cover.vue';
import TrackList from '@/components/TrackList.vue';
import localMusicCover from '@/assets/local-music-cover.svg';
import { isElectron } from '@/utils/env';

export default {
  name: 'LocalPlaylist',
  components: { ButtonTwoTone, Cover, TrackList },
  data() {
    return {
      folder: null,
      tracks: [],
      refreshing: false,
      localMusicCover,
      removeChangeListener: null,
    };
  },
  computed: {
    folderCoverUrl() {
      return this.folder?.coverUrl
        ? `${this.folder.coverUrl}?v=${this.folder.coverUpdatedAt}`
        : this.localMusicCover;
    },
  },
  async created() {
    if (!isElectron || !window.electronAPI?.localMusic) {
      this.$router.replace('/library');
      return;
    }
    this.removeChangeListener = window.electronAPI.localMusic.onChanged(
      this.handleFolderChange
    );
    await this.openFolder();
  },
  activated() {
    if (isElectron && window.electronAPI?.localMusic) this.openFolder();
  },
  deactivated() {
    this.closeFolder();
  },
  beforeDestroy() {
    this.closeFolder();
    this.removeChangeListener?.();
  },
  methods: {
    async openFolder() {
      this.refreshing = true;
      try {
        this.folder = await window.electronAPI.localMusic.openFolder(
          this.$route.params.id
        );
        this.tracks = this.folder?.tracks || [];
        if (!this.folder) this.$router.replace('/library');
      } finally {
        this.refreshing = false;
      }
    },
    closeFolder() {
      if (this.folder?.id) {
        return window.electronAPI.localMusic.closeFolder(this.folder.id);
      }
      return undefined;
    },
    async refreshFolder() {
      if (this.refreshing || !this.folder) return;
      this.refreshing = true;
      try {
        this.folder = await window.electronAPI.localMusic.refreshFolder(
          this.folder.id
        );
        this.tracks = this.folder?.tracks || [];
      } finally {
        this.refreshing = false;
      }
    },
    async handleFolderChange({ folderId }) {
      if (folderId !== this.folder?.id) return;
      this.folder = await window.electronAPI.localMusic.getFolder(folderId);
      this.tracks = this.folder?.tracks || [];
    },
    async playAll() {
      await this.refreshFolder();
      if (!this.tracks.length) return;
      this.$store.state.player.replacePlaylist(
        this.tracks.map(track => track.id),
        this.folder.id,
        'local',
        'first',
        { name: this.folder.name }
      );
    },
    async removeFolder() {
      if (
        !window.confirm(
          this.$t('localMusic.removeFolderConfirm', {
            name: this.folder.name,
          })
        )
      ) {
        return;
      }
      await window.electronAPI.localMusic.removeFolder(this.folder.id);
      this.$router.replace('/library');
    },
  },
};
</script>

<style lang="scss" scoped>
.local-playlist {
  padding-top: 32px;
}

.playlist-info {
  display: flex;
  margin-bottom: 40px;

  .info {
    display: flex;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    margin-left: 56px;
  }

  .title {
    color: var(--color-text);
    font-size: 36px;
    font-weight: 700;
  }

  .artist,
  .date-and-count,
  .description {
    margin-top: 8px;
    color: var(--color-text);
    opacity: 0.68;
  }

  .description {
    overflow: hidden;
    max-width: 560px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

.empty {
  padding: 64px 16px;
  color: var(--color-text);
  text-align: center;
  opacity: 0.58;
}

@media (max-width: 720px) {
  .playlist-info {
    align-items: center;
    flex-direction: column;

    .info {
      align-items: center;
      margin: 28px 0 0;
      text-align: center;
    }
  }
}
</style>

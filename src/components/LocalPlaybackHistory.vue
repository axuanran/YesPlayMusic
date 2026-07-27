<template>
  <div class="local-history">
    <h1>{{ $t('library.clientHistory.title') }}</h1>
    <p class="description">{{ $t('library.clientHistory.description') }}</p>

    <div class="tabs">
      <button
        :class="{ active: activeTab === 'tracks' }"
        @click="activeTab = 'tracks'"
      >
        {{ $t('library.clientHistory.tracks') }}
      </button>
      <button
        :class="{ active: activeTab === 'playlists' }"
        @click="activeTab = 'playlists'"
      >
        {{ $t('library.clientHistory.playlists') }}
      </button>
    </div>

    <template v-if="activeTab === 'tracks'">
      <TrackList
        v-if="trackHistory.length > 0"
        :tracks="trackHistory"
        :column-number="1"
        type="tracklist"
        dbclick-track-func="playLocalHistory"
      />
      <div v-else class="empty">{{
        $t('library.clientHistory.emptyTracks')
      }}</div>
    </template>

    <template v-else>
      <CoverRow
        v-if="playlistHistory.length > 0"
        :items="playlistHistory"
        type="playlist"
        sub-text="none"
        :show-play-button="true"
        :show-play-count="true"
      />
      <div v-else class="empty">{{
        $t('library.clientHistory.emptyPlaylists')
      }}</div>
    </template>
  </div>
</template>

<script>
import { mapState } from 'vuex';
import CoverRow from '@/components/CoverRow.vue';
import TrackList from '@/components/TrackList.vue';

export default {
  name: 'LocalPlaybackHistory',
  components: {
    CoverRow,
    TrackList,
  },
  data() {
    return {
      activeTab: 'tracks',
    };
  },
  computed: {
    ...mapState(['clientPlaybackHistory']),
    trackHistory() {
      return this.clientPlaybackHistory.tracks;
    },
    playlistHistory() {
      return this.clientPlaybackHistory.playlists.map(playlist => ({
        ...playlist,
        name:
          playlist.name ||
          this.$t('library.clientHistory.unknownPlaylist', {
            id: playlist.id,
          }),
        coverImgUrl:
          playlist.coverImgUrl || '/img/icons/android-chrome-512x512.png',
      }));
    },
  },
};
</script>

<style lang="scss" scoped>
.local-history {
  padding-top: 32px;
  color: var(--color-text);
}

h1 {
  margin: 0;
  font-size: 48px;
}

.description {
  margin: 12px 0 32px;
  opacity: 0.68;
  font-size: 16px;
}

.tabs {
  display: flex;
  gap: 12px;
  margin-bottom: 28px;

  button {
    padding: 8px 16px;
    border-radius: 10px;
    background: var(--color-secondary-bg);
    color: var(--color-secondary);
    font-size: 16px;
    font-weight: 600;

    &.active {
      background: var(--color-primary-bg);
      color: var(--color-primary);
    }
  }
}

.empty {
  display: flex;
  min-height: 240px;
  align-items: center;
  justify-content: center;
  opacity: 0.58;
}
</style>

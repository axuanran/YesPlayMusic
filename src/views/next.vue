<template>
  <div class="next-tracks">
    <h1>{{ $t('next.nowPlaying') }}</h1>
    <TrackList
      :tracks="[currentTrack]"
      :type="queueTrackType"
      dbclick-track-func="none"
    />
    <h1 v-show="playNextList.length > 0"
      >插队播放
      <button @click="player.clearPlayNextList()">清除队列</button>
    </h1>
    <TrackList
      v-show="playNextList.length > 0"
      :tracks="playNextTracks"
      :type="queueTrackType"
      :highlight-playing-track="false"
      dbclick-track-func="playTrackOnListByID"
      item-key="id+index"
      :extra-context-menu-item="['removeTrackFromQueue']"
    />
    <h1>{{ $t('next.nextUp') }}</h1>
    <TrackList
      :tracks="filteredTracks"
      :type="queueTrackType"
      :highlight-playing-track="false"
      dbclick-track-func="playTrackOnListByID"
    />
  </div>
</template>

<script>
import { mapState, mapActions } from 'vuex';
import { getTrackDetail } from '@/api/track';
import TrackList from '@/components/TrackList.vue';

export default {
  name: 'Next',
  components: {
    TrackList,
  },
  data() {
    return {
      tracks: [],
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
    filteredTracks() {
      let trackIDs = this.player.list.slice(
        this.player.current + 1,
        this.player.current + 100
      );
      return trackIDs
        .map(tid => this.tracks.find(t => t.id === tid))
        .filter(t => t);
    },
    playNextList() {
      return this.player.playNextList;
    },
    playNextTracks() {
      return this.playNextList.map(tid => {
        return this.tracks.find(t => t.id === tid);
      });
    },
  },
  watch: {
    currentTrack() {
      this.loadTracks();
    },
    playerShuffle() {
      this.loadTracks();
    },
    playNextList() {
      this.loadTracks();
    },
  },
  activated() {
    this.loadTracks();
    this.$parent?.$refs?.scrollbar?.restorePosition?.();
  },
  methods: {
    ...mapActions(['playTrackOnListByID']),
    async loadTracks() {
      // 获取播放列表当前歌曲后100首歌
      let trackIDs = this.player.list.slice(
        this.player.current + 1,
        this.player.current + 100
      );

      // 将playNextList的歌曲加进trackIDs
      trackIDs.push(...this.playNextList);

      // 获取已经加载了的歌曲
      let loadedTrackIDs = this.tracks.map(t => t.id);

      const missingTrackIDs = [
        ...new Set(trackIDs.filter(id => !loadedTrackIDs.includes(id))),
      ];
      const localTrackIDs = missingTrackIDs.filter(
        id => typeof id === 'string' && id.startsWith('local:')
      );
      const streamingTrackIDs = missingTrackIDs.filter(
        id => typeof id === 'string' && id.startsWith('stream:')
      );
      const remoteTrackIDs = missingTrackIDs.filter(
        id => !localTrackIDs.includes(id) && !streamingTrackIDs.includes(id)
      );

      const [localTracks, streamingTracks, remoteTracks] = await Promise.all([
        Promise.all(
          localTrackIDs.map(id => window.electronAPI?.localMusic?.get(id))
        ),
        Promise.all(
          streamingTrackIDs.map(id =>
            window.electronAPI?.streaming?.getTrack(id)
          )
        ),
        remoteTrackIDs.length
          ? getTrackDetail(remoteTrackIDs.join(',')).then(data => data.songs)
          : Promise.resolve([]),
      ]);
      this.tracks.push(
        ...localTracks.filter(Boolean),
        ...streamingTracks.filter(Boolean),
        ...remoteTracks
      );
    },
  },
};
</script>

<style lang="scss" scoped>
h1 {
  margin-top: 36px;
  margin-bottom: 18px;
  cursor: default;
  color: var(--color-text);
  display: flex;
  justify-content: space-between;
  button {
    color: var(--color-text);
    border-radius: 8px;
    padding: 0 14px;
    display: flex;
    justify-content: center;
    align-items: center;
    transition: 0.2s;
    opacity: 0.68;
    font-weight: 500;
    &:hover {
      opacity: 1;
      background: var(--color-secondary-bg);
    }
    &:active {
      opacity: 1;
      transform: scale(0.92);
    }
  }
}
</style>

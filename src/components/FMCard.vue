<template>
  <div class="fm" :style="{ background }" data-theme="dark">
    <img :src="nextTrackCover" style="display: none" loading="lazy" />
    <img
      class="cover"
      :src="resizeImage(track.album && track.album.picUrl, 512)"
      loading="lazy"
      @click="goToAlbum"
    />
    <div class="right-part">
      <div class="info">
        <div class="title">{{ track.name }}</div>
        <div class="artist"><ArtistsInLine :artists="artists" /></div>
      </div>
      <div class="controls">
        <div class="buttons">
          <button-icon title="不喜欢" @click="moveToFMTrash">
            <svg-icon id="thumbs-down" icon-class="thumbs-down" />
          </button-icon>
          <button-icon
            :title="$t(isPlaying ? 'player.pause' : 'player.play')"
            class="play"
            @click="play"
          >
            <svg-icon :icon-class="isPlaying ? 'pause' : 'play'" />
          </button-icon>
          <button-icon :title="$t('player.next')" @click="next">
            <svg-icon icon-class="next" />
          </button-icon>
        </div>
        <div class="card-name"><svg-icon icon-class="fm" />私人FM</div>
      </div>
    </div>
  </div>
</template>

<script>
import ButtonIcon from '@/components/ButtonIcon.vue';
import ArtistsInLine from '@/components/ArtistsInLine.vue';
import { mapState } from 'vuex';
import { loadCoverGradient } from '@/utils/coverGradient';
import { createRequestGeneration } from '@/utils/requestGeneration';

export default {
  name: 'FMCard',
  components: { ButtonIcon, ArtistsInLine },
  data() {
    return {
      background: '',
      coverColorRequests: createRequestGeneration(),
    };
  },
  computed: {
    ...mapState(['player', 'playerVersion']),
    track() {
      return this.player.personalFMTrack;
    },
    isPlaying() {
      void this.playerVersion;
      return this.player.playing && this.player.isPersonalFM;
    },
    artists() {
      return this.track.artists || this.track.ar || [];
    },
    nextTrackCover() {
      return `${this.player._personalFMNextTrack?.album?.picUrl.replace(
        'http://',
        'https://'
      )}?param=512y512`;
    },
  },
  watch: {
    track() {
      this.getColor();
    },
  },
  created() {
    this.getColor();
  },
  beforeUnmount() {
    this.coverColorRequests.invalidate();
  },
  methods: {
    play() {
      this.player.playPersonalFM();
    },
    next() {
      this.player.playNextFMTrack();
    },
    goToAlbum() {
      if (this.track.album.id === 0) return;
      this.$router.push({ path: '/album/' + this.track.album.id });
    },
    moveToFMTrash() {
      this.player.moveToFMTrash();
    },
    async getColor() {
      const requestId = this.coverColorRequests.next();
      const picUrl = this.player.personalFMTrack?.album?.picUrl;
      if (!picUrl) {
        this.background = '';
        return;
      }
      const cover = `${picUrl.replace('http://', 'https://')}?param=512y512`;
      try {
        const background = await loadCoverGradient(cover, 'vibrant');
        if (this.coverColorRequests.isCurrent(requestId)) {
          this.background = background;
        }
      } catch (error) {
        if (!this.coverColorRequests.isCurrent(requestId)) return;
        this.background = '';
        console.warn('Failed to load personal FM cover colors', error);
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.fm {
  padding: 1rem;
  background: var(--color-secondary-bg);
  border-radius: 1rem;
  display: flex;
  height: 198px;
  box-sizing: border-box;
}
.cover {
  display: block;
  height: 100%;
  width: 166px;
  flex: 0 0 166px;
  object-fit: cover;
  clip-path: border-box;
  border-radius: 0.75rem;
  margin-right: 1.2rem;
  cursor: pointer;
  user-select: none;
}
.right-part {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: var(--color-text);
  width: 100%;
  min-width: 0;
  .title {
    font-size: 1.6rem;
    font-weight: 600;
    margin-bottom: 0.6rem;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    word-break: break-all;
  }
  .artist {
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    word-break: break-all;
  }
  .controls {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-left: -0.4rem;
    .buttons {
      display: flex;
    }
    .button-icon {
      margin: 0 8px 0 0;
    }
    .svg-icon {
      width: 24px;
      height: 24px;
    }
    .svg-icon#thumbs-down {
      width: 22px;
      height: 22px;
    }
    .card-name {
      font-size: 1rem;
      opacity: 0.18;
      display: flex;
      align-items: center;
      font-weight: 600;
      user-select: none;
      .svg-icon {
        width: 18px;
        height: 18px;
        margin-right: 6px;
      }
    }
  }
}
</style>

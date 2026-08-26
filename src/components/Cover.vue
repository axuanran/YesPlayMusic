<template>
  <div
    class="cover"
    :class="{ 'cover-hover': coverHover }"
    @click="clickCoverToPlay ? play() : goTo()"
  >
    <div class="cover-container" :style="containerStyles">
      <div class="shade">
        <button
          v-if="alwaysShowPlayButton"
          class="play-button"
          :style="playButtonStyles"
          @click.stop="play()"
          ><svg-icon icon-class="play" />
        </button>
      </div>
      <img
        :src="resolvedImageUrl"
        :style="imageStyles"
        :loading="imageLoading"
        :fetchpriority="imageFetchPriority"
        decoding="async"
        @error="handleImageError"
      />
      <div
        v-if="coverHover || alwaysShowShadow"
        class="shadow"
        :class="{ 'always-show-shadow': alwaysShowShadow }"
        :style="shadowStyles"
      ></div>
    </div>
  </div>
</template>

<script>
import { resolveCoverImageUrl } from '@/utils/coverImageUrl';
import { isCapacitor } from '@/utils/env';

export default {
  props: {
    id: { type: [Number, String], required: true },
    type: { type: String, required: true },
    imageUrl: { type: String, required: true },
    fallbackImageUrl: { type: String, default: '' },
    fixedSize: { type: Number, default: 0 },
    playButtonSize: { type: Number, default: 22 },
    coverHover: { type: Boolean, default: true },
    alwaysShowPlayButton: { type: Boolean, default: true },
    alwaysShowShadow: { type: Boolean, default: false },
    clickCoverToPlay: { type: Boolean, default: false },
    shadowMargin: { type: Number, default: 12 },
    radius: { type: Number, default: 12 },
    imageLoading: { type: String, default: 'lazy' },
    imageFetchPriority: { type: String, default: 'auto' },
    route: { type: [String, Object], default: null },
    playAction: { type: Function, default: null },
  },
  data() {
    return {
      failedImageUrl: '',
    };
  },
  computed: {
    normalizedImageUrl() {
      return resolveCoverImageUrl(this.imageUrl);
    },
    normalizedFallbackImageUrl() {
      return resolveCoverImageUrl(this.fallbackImageUrl);
    },
    resolvedImageUrl() {
      if (!this.normalizedImageUrl) return this.normalizedFallbackImageUrl;
      return this.failedImageUrl === this.normalizedImageUrl &&
        this.normalizedFallbackImageUrl
        ? this.normalizedFallbackImageUrl
        : this.normalizedImageUrl;
    },
    containerStyles() {
      if (this.fixedSize === 0) return {};
      return {
        width: this.fixedSize + 'px',
        height: this.fixedSize + 'px',
      };
    },
    imageStyles() {
      let styles = {};
      if (this.type === 'artist') styles.borderRadius = '50%';
      return styles;
    },
    playButtonStyles() {
      let styles = {};
      styles.width = this.playButtonSize + '%';
      styles.height = this.playButtonSize + '%';
      return styles;
    },
    shadowStyles() {
      let styles = {};
      styles.backgroundImage = this.resolvedImageUrl
        ? `url(${this.resolvedImageUrl})`
        : 'none';
      if (this.type === 'artist') styles.borderRadius = '50%';
      return styles;
    },
  },
  watch: {
    imageUrl() {
      this.failedImageUrl = '';
    },
    fallbackImageUrl() {
      this.failedImageUrl = '';
    },
  },
  methods: {
    handleImageError(event) {
      const failedUrl = event?.currentTarget?.currentSrc || this.resolvedImageUrl;
      if (isCapacitor) {
        console.warn('[cover] image load failed', {
          id: this.id,
          type: this.type,
          url: failedUrl,
          fallback: this.normalizedFallbackImageUrl,
        });
      }
      if (
        this.normalizedFallbackImageUrl &&
        this.resolvedImageUrl !== this.normalizedFallbackImageUrl
      ) {
        this.failedImageUrl = this.normalizedImageUrl;
      }
    },
    play() {
      if (this.playAction) {
        this.playAction();
        return;
      }
      const player = this.$store.state.player;
      const playActions = {
        album: player.playAlbumByID,
        playlist: player.playPlaylistByID,
        artist: player.playArtistByID,
      };
      playActions[this.type].bind(player)(this.id);
    },
    goTo() {
      if (this.route) {
        this.$router.push(this.route);
        return;
      }
      this.$router.push({ name: this.type, params: { id: this.id } });
    },
  },
};
</script>

<style lang="scss" scoped>
.cover {
  position: relative;
  transition: transform 0.3s;
}
.cover-container {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
}
img {
  position: absolute;
  inset: 0;
  display: block;
  border-radius: 0.75em;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  border: 1px solid rgba(0, 0, 0, 0.04);
  box-sizing: border-box;
}

.cover-hover {
  &:hover {
    cursor: pointer;
    /* transform: scale(1.02); */
  }
}

.shade {
  position: absolute;
  inset: 0;
  width: 100%;
  background: transparent;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1;
  pointer-events: none;
}
.play-button {
  display: flex;
  justify-content: center;
  align-items: center;
  color: white;
  backdrop-filter: blur(8px);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.08);
  height: 22%;
  width: 22%;
  border-radius: 50%;
  cursor: default;
  opacity: 0;
  transform: scale(0.96);
  transition:
    opacity 0.2s,
    transform 0.2s,
    background 0.2s;
  pointer-events: auto;
  .svg-icon {
    width: 50%;
    margin: {
      left: 4px;
    }
  }
  &:hover {
    background: rgba(255, 255, 255, 0.28);
  }
  &:active {
    transform: scale(0.9);
  }
}

.cover-hover:hover .play-button,
.cover-hover:focus-within .play-button {
  opacity: 1;
  transform: scale(1);
}

.shadow {
  position: absolute;
  top: 12px;
  height: 100%;
  width: 100%;
  filter: blur(16px) opacity(0.6);
  transform: scale(0.92, 0.96);
  z-index: -1;
  background-size: cover;
  border-radius: 0.75em;
  aspect-ratio: 1 / 1;
  opacity: 0;
  transition: opacity 0.3s;
}

.cover-hover:hover .shadow,
.cover-hover:focus-within .shadow,
.shadow.always-show-shadow {
  opacity: 1;
}
</style>

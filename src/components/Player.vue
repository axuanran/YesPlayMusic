<template>
  <div class="player" @click="handleClick" @mousedown="handleMouseDown">
    <div
      class="progress-bar"
      :class="{
        nyancat: settings.nyancatStyle,
        'nyancat-stop': settings.nyancatStyle && !playing,
      }"
      @click.stop
    >
      <div
        v-if="discordConnected"
        class="discord-status"
        :title="$t('player.discordConnected')"
      >
        <span></span>
        Discord
      </div>
      <input
        class="progress-range"
        type="range"
        :value="progressValue"
        :min="0"
        :max="player.currentTrackDuration"
        :step="1"
        :style="progressRangeStyle"
        :aria-label="$t('player.progress')"
        @pointerdown="handleProgressPointerDown"
        @input="handleProgressInput"
        @change="commitProgressInput"
        @pointerup="commitProgressInput"
        @pointercancel="resetProgressInput"
        @mousedown.stop
        @click.stop
      />
    </div>
    <div class="controls">
      <div class="playing">
        <div class="container" @click.stop>
          <img
            :src="resizeImage(currentTrack.al && currentTrack.al.picUrl, 224)"
            loading="lazy"
            @click="goToAlbum"
          />
          <div class="track-info" :title="audioSource">
            <div
              :class="['name', { 'has-list': hasList() }]"
              @click="hasList() && goToList()"
            >
              {{ currentTrack.name }}
            </div>
            <div class="artist">
              <span
                v-for="(ar, index) in currentTrack.ar"
                :key="ar.id"
                @click="ar.id && goToArtist(ar.id)"
              >
                <span :class="{ ar: ar.id }"> {{ ar.name }} </span
                ><span v-if="index !== currentTrack.ar.length - 1">, </span>
              </span>
            </div>
          </div>
          <div class="track-action-buttons">
            <button-icon
              :title="
                player.isCurrentTrackLiked
                  ? $t('player.unlike')
                  : $t('player.like')
              "
              @click="likeCurrentTrack"
            >
              <svg-icon
                v-show="!player.isCurrentTrackLiked"
                icon-class="heart"
              ></svg-icon>
              <svg-icon
                v-show="player.isCurrentTrackLiked"
                icon-class="heart-solid"
              ></svg-icon>
            </button-icon>
            <button-icon
              :class="{ disabled: !canAddCurrentTrackToPlaylist }"
              :title="$t('player.addToPlaylist')"
              @click="addCurrentTrackToPlaylist"
            >
              <svg-icon icon-class="plus"></svg-icon>
            </button-icon>
          </div>
        </div>
        <div class="blank"></div>
      </div>
      <div class="middle-control-buttons">
        <div class="blank"></div>
        <div class="container" @click.stop>
          <button-icon
            v-show="!player.isPersonalFM"
            :title="$t('player.previous')"
            @click="playPrevTrack"
            ><svg-icon icon-class="previous"
          /></button-icon>
          <button-icon
            v-show="player.isPersonalFM"
            title="不喜欢"
            @click="moveToFMTrash"
            ><svg-icon icon-class="thumbs-down"
          /></button-icon>
          <button-icon
            class="play"
            :title="$t(playing ? 'player.pause' : 'player.play')"
            @click="playOrPause"
          >
            <svg-icon :icon-class="playing ? 'pause' : 'play'"
          /></button-icon>
          <button-icon :title="$t('player.next')" @click="playNextTrack"
            ><svg-icon icon-class="next"
          /></button-icon>
        </div>
        <div class="blank"></div>
      </div>
      <div class="right-control-buttons">
        <div class="blank"></div>
        <div class="container" @click.stop>
          <button-icon
            :title="$t('player.nextUp')"
            :class="{
              active: $route.name === 'next',
              disabled: player.isPersonalFM,
            }"
            @click="goToNextTracksPage"
            ><svg-icon icon-class="list"
          /></button-icon>
          <button-icon
            :class="{
              active: player.repeatMode !== 'off',
              disabled: player.isPersonalFM,
            }"
            :title="
              player.repeatMode === 'one'
                ? $t('player.repeatTrack')
                : $t('player.repeat')
            "
            @click="switchRepeatMode"
          >
            <svg-icon
              v-show="player.repeatMode !== 'one'"
              icon-class="repeat"
            />
            <svg-icon
              v-show="player.repeatMode === 'one'"
              icon-class="repeat-1"
            />
          </button-icon>
          <button-icon
            :class="{ active: player.shuffle, disabled: player.isPersonalFM }"
            :title="$t('player.shuffle')"
            @click="switchShuffle"
            ><svg-icon icon-class="shuffle"
          /></button-icon>
          <button-icon
            v-if="settings.enableReversedMode"
            :class="{ active: player.reversed, disabled: player.isPersonalFM }"
            :title="$t('player.reversed')"
            @click="switchReversed"
            ><svg-icon icon-class="sort-up"
          /></button-icon>
          <details ref="playbackRateControl" class="playback-rate-control">
            <summary :title="$t('player.playbackRate')">
              {{ playbackRate }}×
            </summary>
            <div
              class="playback-rate-options"
              role="listbox"
              :aria-label="$t('player.playbackRate')"
            >
              <button
                v-for="rate in playbackRates"
                :key="rate"
                type="button"
                role="option"
                :aria-selected="playbackRate === rate"
                :class="{ active: playbackRate === rate }"
                @click="setPlaybackRate(rate)"
              >
                {{ rate }}×
              </button>
            </div>
          </details>
          <div class="volume-control">
            <button-icon :title="$t('player.mute')" @click="mute">
              <svg-icon v-show="volume > 0.5" icon-class="volume" />
              <svg-icon v-show="volume === 0" icon-class="volume-mute" />
              <svg-icon
                v-show="volume <= 0.5 && volume !== 0"
                icon-class="volume-half"
              />
            </button-icon>
            <div class="volume-bar">
              <vue-slider
                v-model="volume"
                :min="0"
                :max="1"
                :interval="0.01"
                :drag-on-click="true"
                :duration="0"
                tooltip="none"
                :dot-size="12"
              ></vue-slider>
            </div>
          </div>

          <button-icon
            class="lyrics-button"
            title="歌词"
            style="margin-left: 12px"
            @click="toggleLyrics"
            ><svg-icon icon-class="arrow-up"
          /></button-icon>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapMutations, mapActions } from 'vuex';
import '@/assets/css/slider.css';

import ButtonIcon from '@/components/ButtonIcon.vue';
import VueSlider from 'vue-slider-component';
import { goToListSource, hasListSource } from '@/utils/playList';
import { isAccountLoggedIn } from '@/utils/auth';
import locale from '@/locale';
import { PLAYBACK_RATES } from '@/utils/playbackRate';

export default {
  name: 'Player',
  components: {
    ButtonIcon,
    VueSlider,
  },
  data() {
    return {
      mouseDownTarget: null,
      isProgressDragging: false,
      localProgress: 0,
      playbackRates: PLAYBACK_RATES,
      discordConnected: false,
      removeDiscordStatusListener: null,
    };
  },
  computed: {
    ...mapState(['player', 'playerVersion', 'settings', 'data']),
    currentTrack() {
      const version = this.playerVersion;
      if (version < 0) return this.player.displayTrack;
      return this.player.displayTrack;
    },
    volume: {
      get() {
        return this.player.volume;
      },
      set(value) {
        this.player.volume = value;
      },
    },
    playing() {
      void this.playerVersion;
      return this.player.playing;
    },
    progressValue() {
      void this.playerVersion;
      if (this.isProgressDragging) return this.localProgress;
      return Math.min(
        this.player.progress || 0,
        this.player.currentTrackDuration || 0
      );
    },
    progressPercent() {
      const duration = this.player.currentTrackDuration || 0;
      if (duration <= 0) return 0;
      return Math.min(100, Math.max(0, (this.progressValue / duration) * 100));
    },
    progressRangeStyle() {
      return {
        '--progress-percent': `${this.progressPercent}%`,
      };
    },
    playbackRate() {
      void this.playerVersion;
      return this.player.playbackRate;
    },
    audioSource() {
      return this.player.currentAudioSource?.includes('kuwo.cn')
        ? '音源来自酷我音乐'
        : '';
    },
    canAddCurrentTrackToPlaylist() {
      return !this.player.isTrackPending && Boolean(this.currentTrack?.id);
    },
  },
  mounted() {
    this.setupMediaControls();
    window.addEventListener('keydown', this.handleKeydown);
    document.addEventListener(
      'pointerdown',
      this.closePlaybackRateOnOutsideClick
    );
    this.removeDiscordStatusListener =
      window.electronAPI?.appEvents?.onDiscordStatus?.(connected => {
        this.discordConnected = connected === true;
      }) || null;
    window.electronAPI?.appEvents
      ?.getDiscordStatus?.()
      .then(connected => {
        this.discordConnected = connected === true;
      })
      .catch(() => {
        this.discordConnected = false;
      });
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener(
      'pointerdown',
      this.closePlaybackRateOnOutsideClick
    );
    this.removeDiscordStatusListener?.();
  },
  methods: {
    ...mapMutations(['toggleLyrics', 'updateModal']),
    ...mapActions(['showToast', 'likeATrack', 'fetchLikedPlaylist']),
    handleClick(event) {
      if (event.target == this.mouseDownTarget) {
        this.toggleLyrics();
      }
    },
    handleMouseDown(event) {
      this.mouseDownTarget = event.target;
    },
    normalizeProgressInput(value) {
      const duration = this.player.currentTrackDuration || 0;
      return Math.min(duration, Math.max(0, Number(value) || 0));
    },
    handleProgressPointerDown(event) {
      this.isProgressDragging = true;
      this.localProgress = this.normalizeProgressInput(event.target.value);
    },
    handleProgressInput(event) {
      this.localProgress = this.normalizeProgressInput(event.target.value);
    },
    commitProgressInput(event) {
      if (!this.isProgressDragging && event.type !== 'change') return;
      this.localProgress = this.normalizeProgressInput(event.target.value);
      this.player.progress = this.localProgress;
      this.isProgressDragging = false;
    },
    resetProgressInput() {
      this.isProgressDragging = false;
      this.localProgress = this.progressValue;
    },
    playPrevTrack() {
      this.player.playPrevTrack();
    },
    playOrPause() {
      this.player.playOrPause();
    },
    playNextTrack() {
      if (this.player.isPersonalFM) {
        this.player.playNextFMTrack();
      } else {
        this.player.playNextTrack();
      }
    },
    likeCurrentTrack() {
      if (this.player.isTrackPending) return;
      this.likeATrack(this.player.currentTrack.id);
    },
    addCurrentTrackToPlaylist() {
      if (!this.canAddCurrentTrackToPlaylist) return;
      if (!isAccountLoggedIn()) {
        this.showToast(locale.t('toast.needToLogin'));
        return;
      }
      this.fetchLikedPlaylist();
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'selectedTrackID',
        value: this.currentTrack.id,
      });
      this.updateModal({
        modalName: 'addTrackToPlaylistModal',
        key: 'show',
        value: true,
      });
    },
    goToNextTracksPage() {
      if (this.player.isPersonalFM) return;
      this.$route.name === 'next'
        ? this.$router.go(-1)
        : this.$router.push({ name: 'next' });
    },
    hasList() {
      return hasListSource();
    },
    goToList() {
      goToListSource();
    },
    goToAlbum() {
      if (this.player.isTrackPending) return;
      if (this.player.currentTrack.al.id === 0) return;
      this.$router.push({ path: '/album/' + this.player.currentTrack.al.id });
    },
    goToArtist(id) {
      this.$router.push({ path: '/artist/' + id });
    },
    moveToFMTrash() {
      this.player.moveToFMTrash();
    },
    switchRepeatMode() {
      this.player.switchRepeatMode();
    },
    switchShuffle() {
      this.player.switchShuffle();
    },
    switchReversed() {
      this.player.switchReversed();
    },
    setPlaybackRate(rate) {
      this.player.playbackRate = rate;
      this.$refs.playbackRateControl?.removeAttribute('open');
    },
    closePlaybackRateOnOutsideClick(event) {
      const control = this.$refs.playbackRateControl;
      if (control?.open && !control.contains(event.target)) {
        control.removeAttribute('open');
      }
    },
    mute() {
      this.player.mute();
    },

    setupMediaControls() {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', () => {
          this.playOrPause();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          this.playOrPause();
        });
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          this.playPrevTrack();
        });
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          this.playNextTrack();
        });
      }
    },

    handleKeydown(event) {
      if (event.key === 'Escape') {
        this.$refs.playbackRateControl?.removeAttribute('open');
        return;
      }
      switch (event.code) {
        case 'MediaPlayPause':
          this.playOrPause();
          break;
        case 'MediaTrackPrevious':
          this.playPrevTrack();
          break;
        case 'MediaTrackNext':
          this.playNextTrack();
          break;
        default:
          break;
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.player {
  position: fixed;
  bottom: 0;
  right: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  height: 64px;
  backdrop-filter: saturate(180%) blur(30px);
  // background-color: rgba(255, 255, 255, 0.86);
  background-color: var(--color-navbar-bg);
  z-index: 100;
}

@supports (-moz-appearance: none) {
  .player {
    background-color: var(--color-body-bg);
  }
}

.progress-bar {
  margin-top: -6px;
  margin-bottom: -6px;
  width: 100%;
  height: 14px;
  display: flex;
  align-items: center;
  position: relative;
}

.discord-status {
  position: absolute;
  right: 12px;
  top: 0;
  z-index: 2;
  height: 14px;
  padding: 0 5px;
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 7px;
  color: var(--color-text);
  background: var(--color-navbar-bg);
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #23a55a;
  }
}

.progress-range {
  width: 100%;
  height: 14px;
  margin: 0;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  cursor: pointer;
}

.progress-range::-webkit-slider-runnable-track {
  height: 2px;
  background: linear-gradient(
    to right,
    var(--color-primary) 0%,
    var(--color-primary) var(--progress-percent),
    rgba(128, 128, 128, 0.28) var(--progress-percent),
    rgba(128, 128, 128, 0.28) 100%
  );
}

.progress-range::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -5px;
  border-radius: 50%;
  background: var(--color-primary);
  border: none;
}

.progress-range:focus {
  outline: none;
}

.controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  height: 100%;
  padding: {
    right: 10vw;
    left: 10vw;
  }
}

@media (max-width: 1336px) {
  .controls {
    padding: 0 5vw;
  }
}

.blank {
  flex-grow: 1;
}

.playing {
  display: flex;
}

.playing .container {
  display: flex;
  align-items: center;
  img {
    height: 46px;
    border-radius: 5px;
    box-shadow: 0 6px 8px -2px rgba(0, 0, 0, 0.16);
    cursor: pointer;
    user-select: none;
  }
  .track-info {
    height: 46px;
    margin-left: 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    .name {
      font-weight: 600;
      font-size: 16px;
      opacity: 0.88;
      color: var(--color-text);
      margin-bottom: 4px;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      word-break: break-all;
    }
    .has-list {
      cursor: pointer;
      &:hover {
        text-decoration: underline;
      }
    }
    .artist {
      font-size: 12px;
      opacity: 0.58;
      color: var(--color-text);
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      overflow: hidden;
      word-break: break-all;
      span.ar {
        cursor: pointer;
        &:hover {
          text-decoration: underline;
        }
      }
    }
  }
}

.middle-control-buttons {
  display: flex;
}

.middle-control-buttons .container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 8px;
  .button-icon {
    margin: 0 8px;
  }
  .play {
    height: 42px;
    width: 42px;
    .svg-icon {
      width: 24px;
      height: 24px;
    }
  }
}

.right-control-buttons {
  display: flex;
}

.right-control-buttons .container {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  .expand {
    margin-left: 24px;
    .svg-icon {
      height: 24px;
      width: 24px;
    }
  }
  .active .svg-icon {
    color: var(--color-primary);
  }
  .volume-control {
    margin-left: 4px;
    display: flex;
    align-items: center;
    .volume-bar {
      width: 84px;
    }
  }
  .playback-rate-control {
    position: relative;
    margin-left: 4px;
    summary {
      align-items: center;
      border-radius: 25%;
      color: var(--color-text);
      cursor: pointer;
      display: flex;
      font-size: 12px;
      font-weight: 700;
      height: 32px;
      justify-content: center;
      list-style: none;
      min-width: 36px;
      transition: 0.2s;
      &::-webkit-details-marker {
        display: none;
      }
      &:hover {
        background: var(--color-secondary-bg-for-transparent);
      }
    }
    &[open] summary {
      color: var(--color-primary);
      background: var(--color-primary-bg);
    }
  }
  .playback-rate-options {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    display: grid;
    grid-template-columns: repeat(2, minmax(54px, 1fr));
    gap: 4px;
    width: 120px;
    padding: 6px;
    border: 1px solid rgba(128, 128, 128, 0.14);
    border-radius: 12px;
    background: var(--color-navbar-bg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(16px);
    z-index: 1001;
    button {
      padding: 7px 8px;
      border-radius: 8px;
      color: var(--color-text);
      font-size: 13px;
      font-weight: 600;
      &:hover,
      &.active {
        color: var(--color-primary);
        background: var(--color-primary-bg-for-transparent);
      }
    }
  }
}

.track-action-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 16px;
}

.button-icon.disabled {
  cursor: default;
  opacity: 0.38;
  &:hover {
    background: none;
  }
  &:active {
    transform: unset;
  }
}
</style>

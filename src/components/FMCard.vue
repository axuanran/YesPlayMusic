<template>
  <div
    class="fm"
    :style="{ background }"
    :data-theme="background ? 'dark' : null"
    :aria-busy="isLoading"
  >
    <img
      v-if="nextTrackCover"
      :src="nextTrackCover"
      alt=""
      style="display: none"
      loading="lazy"
    />
    <button
      class="cover-button"
      type="button"
      :disabled="!album.id"
      :aria-label="$t('roaming.openAlbum')"
      @click="goToAlbum"
    >
      <img
        v-if="coverUrl && !failedCover"
        class="cover"
        alt=""
        :src="coverUrl"
        loading="lazy"
        @error="failedCover = true"
      />
      <svg-icon v-else class="cover-placeholder" icon-class="fm" />
    </button>
    <div class="right-part">
      <div class="roaming-options">
        <button
          class="roaming-select"
          type="button"
          :aria-label="`${$t('roaming.mode')}: ${$t(`roaming.modes.${player.personalFMMode}`)}`"
          aria-haspopup="menu"
          :aria-expanded="menuType === 'mode'"
          :disabled="isLoading"
          @click.stop="openRoamingMenu('mode', $event)"
          @keydown.down.prevent="openRoamingMenu('mode', $event)"
          @keydown.up.prevent="openRoamingMenu('mode', $event)"
        >
          <span>{{ $t(`roaming.modes.${player.personalFMMode}`) }}</span>
          <svg-icon icon-class="arrow-down" />
        </button>
        <button
          v-if="player.personalFMMode === 'SCENE_RCMD'"
          class="roaming-select"
          type="button"
          :aria-label="`${$t('roaming.scene')}: ${$t(`roaming.scenes.${player.personalFMSubmode}`)}`"
          aria-haspopup="menu"
          :aria-expanded="menuType === 'scene'"
          :disabled="isLoading"
          @click.stop="openRoamingMenu('scene', $event)"
          @keydown.down.prevent="openRoamingMenu('scene', $event)"
          @keydown.up.prevent="openRoamingMenu('scene', $event)"
        >
          <span>{{ $t(`roaming.scenes.${player.personalFMSubmode}`) }}</span>
          <svg-icon icon-class="arrow-down" />
        </button>
        <ContextMenu ref="roamingMenu" :label="roamingMenuLabel">
          <div
            v-for="option in roamingMenuOptions"
            :key="option.value"
            class="item roaming-menu-option"
            role="menuitemradio"
            :aria-checked="selectedRoamingOption === option.value"
            @click="selectRoamingOption(option.value)"
            @focus="scrollMenuOption"
          >
            <span>{{ option.label }}</span>
            <svg
              v-if="selectedRoamingOption === option.value"
              class="selected-mark"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m3 8 3 3 7-7"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
        </ContextMenu>
      </div>
      <div class="info">
        <div class="title">{{ track.name || $t('roaming.title') }}</div>
        <div v-if="artists.length" class="artist"
          ><ArtistsInLine :artists="artists"
        /></div>
        <div v-else class="artist">{{
          $t(isLoading ? 'roaming.loading' : 'roaming.description')
        }}</div>
        <div v-if="hasLoadError" class="load-error" role="status">
          <span>{{ $t('roaming.loadFailed') }}</span>
          <button
            type="button"
            :disabled="isLoading"
            @click="player.retryPersonalFM()"
            >{{ $t('home.retry') }}</button
          >
        </div>
      </div>
      <div class="controls">
        <div class="buttons">
          <button-icon
            :title="$t('roaming.dislike')"
            :disabled="isLoading || !track.id"
            @click="moveToFMTrash"
          >
            <svg-icon id="thumbs-down" icon-class="thumbs-down" />
          </button-icon>
          <button-icon
            :title="$t(isPlaying ? 'player.pause' : 'player.play')"
            class="play"
            :disabled="isLoading"
            @click="play"
          >
            <svg-icon :icon-class="isPlaying ? 'pause' : 'play'" />
          </button-icon>
          <button-icon
            :title="$t('player.next')"
            :disabled="isLoading"
            @click="next"
          >
            <svg-icon icon-class="next" />
          </button-icon>
        </div>
        <div class="card-name"
          ><svg-icon icon-class="fm" />{{ $t('roaming.title') }}</div
        >
      </div>
    </div>
  </div>
</template>

<script>
import ButtonIcon from '@/components/ButtonIcon.vue';
import ContextMenu from '@/components/ContextMenu.vue';
import ArtistsInLine from '@/components/ArtistsInLine.vue';
import { mapState } from 'vuex';
import { loadCoverGradient } from '@/utils/coverGradient';
import { createRequestGeneration } from '@/utils/requestGeneration';
import { PERSONAL_FM_MODES, PERSONAL_FM_SCENES } from '@/utils/personalFM';
import { createSizedCoverUrl } from '@/utils/coverImageUrl';

export default {
  name: 'FMCard',
  components: { ButtonIcon, ArtistsInLine, ContextMenu },
  data() {
    return {
      background: '',
      failedCover: false,
      coverColorRequests: createRequestGeneration(),
      menuType: null,
    };
  },
  computed: {
    ...mapState(['player', 'playerVersion']),
    track() {
      void this.playerVersion;
      return this.player.personalFMTrack || {};
    },
    album() {
      return this.track.album || this.track.al || {};
    },
    coverUrl() {
      return createSizedCoverUrl(this.album, 512);
    },
    isLoading() {
      void this.playerVersion;
      return this.player.personalFMLoading;
    },
    hasLoadError() {
      void this.playerVersion;
      return this.player.personalFMError;
    },
    isPlaying() {
      void this.playerVersion;
      return this.player.playing && this.player.isPersonalFM;
    },
    artists() {
      return this.track.artists || this.track.ar || [];
    },
    nextTrackCover() {
      void this.playerVersion;
      const track = this.player._personalFMNextTrack;
      return createSizedCoverUrl(track, 512);
    },
    roamingMenuLabel() {
      return this.$t(
        this.menuType === 'scene' ? 'roaming.scene' : 'roaming.mode'
      );
    },
    roamingMenuOptions() {
      const isScene = this.menuType === 'scene';
      return (isScene ? PERSONAL_FM_SCENES : PERSONAL_FM_MODES).map(value => ({
        value,
        label: this.$t(`roaming.${isScene ? 'scenes' : 'modes'}.${value}`),
      }));
    },
    selectedRoamingOption() {
      void this.playerVersion;
      return this.menuType === 'scene'
        ? this.player.personalFMSubmode
        : this.player.personalFMMode;
    },
  },
  watch: {
    isLoading(loading) {
      if (loading) this.$refs.roamingMenu?.closeMenu();
    },
    coverUrl() {
      this.failedCover = false;
      this.getColor();
    },
  },
  created() {
    this.getColor();
  },
  deactivated() {
    this.$refs.roamingMenu?.closeMenu(false);
  },
  beforeUnmount() {
    this.coverColorRequests.invalidate();
  },
  methods: {
    openRoamingMenu(type, event) {
      if (this.isLoading) return;
      if (this.menuType === type) {
        this.$refs.roamingMenu.closeMenu();
        return;
      }
      this.menuType = type;
      const trigger = event.currentTarget;
      const rect = trigger.getBoundingClientRect();
      this.$refs.roamingMenu.openMenu({
        currentTarget: trigger,
        clientX: rect.left,
        clientY: rect.bottom + 6,
        preventDefault() {},
      });
      this.$nextTick(() =>
        requestAnimationFrame(() => {
          if (this.menuType !== type) return;
          this.$refs.roamingMenu?.$refs.menu
            ?.querySelector('[aria-checked="true"]')
            ?.focus({ preventScroll: true });
        })
      );
    },
    closeMenu() {
      this.menuType = null;
    },
    scrollMenuOption(event) {
      event.currentTarget.scrollIntoView({ block: 'nearest' });
    },
    selectRoamingOption(value) {
      if (this.isLoading) return;
      return this.menuType === 'scene'
        ? this.player.setPersonalFMMode('SCENE_RCMD', value)
        : this.player.setPersonalFMMode(value);
    },
    play() {
      this.player.playPersonalFM();
    },
    next() {
      this.player.playNextFMTrack();
    },
    goToAlbum() {
      if (!this.album.id) return;
      this.$router.push({ path: '/album/' + this.album.id });
    },
    moveToFMTrash() {
      this.player.moveToFMTrash();
    },
    async getColor() {
      const requestId = this.coverColorRequests.next();
      const cover = this.coverUrl;
      if (!cover) {
        this.background = '';
        return;
      }
      try {
        const background = await loadCoverGradient(cover, 'vibrant');
        if (this.coverColorRequests.isCurrent(requestId)) {
          // Keep text and native controls readable even on very light covers.
          this.background = `linear-gradient(rgb(0 0 0 / 68%), rgb(0 0 0 / 68%)), ${background}`;
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
  min-height: 198px;
  box-sizing: border-box;
}
.cover-button {
  padding: 0;
  background: var(--color-secondary-bg-for-transparent);
  color: var(--color-text);
  display: block;
  height: 166px;
  width: 166px;
  flex: 0 0 166px;
  align-self: center;
  object-fit: cover;
  clip-path: border-box;
  border-radius: 0.75rem;
  margin-right: 1.2rem;
  cursor: pointer;
  user-select: none;
  &:disabled {
    cursor: default;
  }
  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }
}
.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-placeholder {
  width: 48px;
  height: 48px;
  margin: auto;
  opacity: 0.65;
}
.roaming-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  .roaming-select {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    max-width: 100%;
    min-height: 32px;
    padding: 6px 10px;
    border: 0;
    border-radius: 8px;
    background: var(--color-secondary-bg-for-transparent);
    color: var(--color-text);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    line-height: 20px;
    cursor: pointer;
    transition: background 150ms ease;
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .svg-icon {
      height: 10px;
      width: 10px;
      flex-shrink: 0;
      opacity: 0.72;
    }
    &[aria-expanded='true'],
    &:hover {
      background: var(--color-primary-bg-for-transparent);
    }
    &:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    &:disabled {
      opacity: 0.6;
      cursor: wait;
    }
  }
}
.roaming-menu-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  min-height: 38px;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--color-text);
  font-size: 14px;
  font-family: 'Barlow', ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  cursor: pointer;
  &[aria-checked='true'] {
    background: var(--color-primary-bg-for-transparent);
  }
  &:hover,
  &:focus-visible {
    color: var(--color-text);
    outline: none;
    background: var(--color-primary-bg-for-transparent);
  }
  &:active {
    opacity: 0.75;
  }
  .selected-mark {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
}
@media (pointer: coarse) {
  .roaming-menu-option {
    min-height: 44px;
  }
  .roaming-options .roaming-select {
    min-height: 40px;
  }
}
.load-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 12px;
  button {
    padding: 4px;
    border-radius: 4px;
    color: inherit;
    background: var(--color-secondary-bg-for-transparent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}
.right-part {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: var(--color-text);
  width: 100%;
  min-width: 0;
  gap: 8px;
  .title {
    font-size: 1.3rem;
    font-weight: 600;
    margin-bottom: 0.3rem;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
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
    flex-wrap: wrap;
    gap: 4px 8px;
    justify-content: space-between;
    align-items: center;
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
      opacity: 0.72;
      white-space: nowrap;
      margin-left: auto;
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
@media (max-width: 1100px) {
  .cover-button {
    width: 120px;
    height: 120px;
    flex-basis: 120px;
  }
  .right-part .controls .card-name {
    font-size: 0.8rem;
  }
}
@media (max-width: 420px) {
  .fm {
    padding: 12px;
  }
  .cover-button {
    width: 96px;
    height: 96px;
    flex-basis: 96px;
    margin-right: 12px;
  }
  .right-part .controls .card-name .svg-icon {
    display: none;
  }
}
</style>

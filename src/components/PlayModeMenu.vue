<template>
  <div class="play-mode-menu">
    <button
      v-if="variant === 'circle'"
      class="play-mode-button"
      type="button"
      :title="$t('player.playModeMenu')"
      :aria-label="$t('player.playModeMenu')"
      @click.stop="openMenu"
    >
      <svg-icon icon-class="shuffle" />
    </button>

    <ButtonTwoTone
      v-else
      icon-class="shuffle"
      :icon-button="iconButton"
      :horizontal-padding="iconButton ? 0 : 16"
      color="grey"
      @click.stop="openMenu"
    >
      <template v-if="!iconButton">{{ $t('player.playModeMenu') }}</template>
    </ButtonTwoTone>

    <ContextMenu ref="menu">
      <div class="item" @click="play('cardiac')">
        <svg-icon icon-class="heart" />
        <span>{{ $t('contextMenu.cardiacMode') }}</span>
      </div>
      <hr />
      <div
        class="item"
        :class="{ 'is-current': currentMode === 'order' }"
        @click="play('order')"
      >
        <svg-icon icon-class="order" />
        <span>{{ $t('player.playModeOrder') }}</span>
      </div>
      <div
        class="item"
        :class="{ 'is-current': currentMode === 'shuffle' }"
        @click="play('shuffle')"
      >
        <svg-icon icon-class="shuffle" />
        <span>{{ $t('player.playModeShuffle') }}</span>
      </div>
    </ContextMenu>
  </div>
</template>

<script>
import ContextMenu from '@/components/ContextMenu.vue';
import ButtonTwoTone from '@/components/ButtonTwoTone.vue';
import SvgIcon from '@/components/SvgIcon.vue';

/**
 * 播放模式菜单：点击按钮弹出「心动模式 / 顺序播放 / 随机播放」，
 * 选中后立即按该模式播放指定歌单。
 *
 * 音乐库的「我喜欢的音乐」卡片和歌单页顶部共用这个组件，
 * 只是按钮外观不同（variant: 'circle' | 'tone'）。
 */
export default {
  name: 'PlayModeMenu',
  components: { ContextMenu, ButtonTwoTone, SvgIcon },
  props: {
    playlistId: {
      type: [Number, String],
      default: null,
    },
    variant: {
      type: String,
      default: 'circle',
    },
    iconButton: {
      type: Boolean,
      default: false,
    },
  },
  computed: {
    currentMode() {
      // player 不是深度响应式，靠 playerVersion 触发重新计算
      void this.$store.state.playerVersion;
      const player = this.$store.state.player;
      if (!player) return 'order';
      return player.shuffle ? 'shuffle' : 'order';
    },
  },
  methods: {
    openMenu(e) {
      this.$refs.menu.openMenu(e);
    },
    play(mode) {
      const player = this.$store.state.player;
      if (!player || !this.playlistId) return;
      if (mode === 'cardiac') {
        player.playIntelligenceListById(this.playlistId, 'first', true);
        return;
      }
      player.playPlaylistByIDWithMode(this.playlistId, {
        shuffle: mode === 'shuffle',
        repeatMode: 'on',
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.play-mode-menu {
  display: inline-flex;
  align-items: center;
}

button.play-mode-button {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 36px;
  width: 36px;
  border-radius: 50%;
  background: var(--color-secondary-bg);
  color: var(--color-text);
  cursor: pointer;
  transition: 0.2s;
  -webkit-app-region: no-drag;

  .svg-icon {
    height: 16px;
    width: 16px;
  }
  &:hover {
    transform: scale(1.06);
  }
  &:active {
    transform: scale(0.94);
  }
}
</style>

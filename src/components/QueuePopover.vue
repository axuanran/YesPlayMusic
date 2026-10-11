<template>
  <div
    class="queue-popover"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    @focusin="onEnter"
    @focusout="onLeave"
  >
    <button-icon
      :title="$t('player.nextUp')"
      :aria-pressed="$route.name === 'next'"
      :aria-expanded="String(visible)"
      :disabled="player.isPersonalFM"
      :class="{
        active: $route.name === 'next' || visible,
        disabled: player.isPersonalFM,
      }"
      @click="goToNextTracksPage"
    >
      <svg-icon icon-class="list" />
    </button-icon>

    <transition name="queue-pop">
      <div
        v-if="visible && !player.isPersonalFM"
        class="queue-panel"
        role="dialog"
        :aria-label="$t('player.nextUp')"
      >
        <div class="queue-head">
          <span class="queue-title">{{ $t('player.nextUp') }}</span>
          <span v-if="totalCount" class="queue-count">{{ totalCount }}</span>
        </div>

        <div class="queue-scroll">
          <!-- 正在播放 -->
          <div v-if="currentTrack" class="queue-section">
            <div class="queue-section-title">{{ $t('next.nowPlaying') }}</div>
            <div class="queue-item is-current">
              <span class="queue-index">
                <span class="playing-bars" aria-hidden="true">
                  <i></i><i></i><i></i>
                </span>
              </span>
              <span class="queue-main">
                <span class="queue-name">{{ currentTrack.name }}</span>
                <span class="queue-artist">{{ artistName(currentTrack) }}</span>
              </span>
            </div>
          </div>

          <!-- 优先播放（插队） -->
          <div v-if="playNextTracks.length" class="queue-section">
            <div class="queue-section-title">
              {{ $t('next.playNext') }}
              <button
                type="button"
                class="queue-clear"
                @click.stop="clearPlayNext"
              >
                {{ $t('next.clearQueue') }}
              </button>
            </div>
            <div
              v-for="(track, index) in playNextTracks"
              :key="`next-${track.id}-${index}`"
              class="queue-item is-playnext"
              @click="play(track.id)"
            >
              <span class="queue-index">{{ index + 1 }}</span>
              <span class="queue-main">
                <span class="queue-name">{{ track.name }}</span>
                <span class="queue-artist">{{ artistName(track) }}</span>
              </span>
            </div>
          </div>

          <!-- 接下来播放 -->
          <div class="queue-section">
            <div class="queue-section-title">{{ $t('next.nextUp') }}</div>
            <div v-if="loading && !upcomingTracks.length" class="queue-tip">
              {{ $t('next.loading') }}
            </div>
            <div v-else-if="loadError" class="queue-tip queue-tip-error">
              <span>{{ $t('next.loadFailed') }}</span>
              <button type="button" @click.stop="loadTracks">{{
                $t('next.retry')
              }}</button>
            </div>
            <div v-else-if="!upcomingTracks.length" class="queue-tip">
              {{ $t('next.empty') }}
            </div>
            <template v-else>
              <div
                v-for="(track, index) in upcomingTracks"
                :key="`up-${track.id}-${index}`"
                class="queue-item"
                @click="play(track.id)"
              >
                <span class="queue-index">{{ index + 1 }}</span>
                <span class="queue-main">
                  <span class="queue-name">{{ track.name }}</span>
                  <span class="queue-artist">{{ artistName(track) }}</span>
                </span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import { mapState } from 'vuex';
import ButtonIcon from '@/components/ButtonIcon.vue';
import { getTrackDetail } from '@/api/track';
import { collectQueueTrackIds, getMissingTrackIds } from '@/utils/queueTracks';
import { createRequestGeneration } from '@/utils/requestGeneration';

const UPCOMING_LIMIT = 50;
const HOVER_OPEN_DELAY = 120;
const HOVER_CLOSE_DELAY = 200;

export default {
  name: 'QueuePopover',
  components: { ButtonIcon },
  data() {
    return {
      visible: false,
      tracks: [],
      loading: false,
      loadError: false,
      openTimer: null,
      closeTimer: null,
      requestGeneration: createRequestGeneration(),
    };
  },
  computed: {
    ...mapState(['player']),
    currentTrack() {
      void this.$store.state.playerVersion;
      return this.player.displayTrack;
    },
    playNextIds() {
      void this.$store.state.playerVersion;
      return [...(this.player.playNextList || [])];
    },
    upcomingIds() {
      void this.$store.state.playerVersion;
      const list = this.player.list || [];
      const current = this.player.current ?? 0;
      return collectQueueTrackIds(
        list,
        current,
        this.player.playNextList || [],
        UPCOMING_LIMIT
      ).filter(id => !this.playNextIds.includes(id));
    },
    trackLookup() {
      return new Map(this.tracks.map(track => [track.id, track]));
    },
    playNextTracks() {
      return this.playNextIds
        .map(id => this.trackLookup.get(id))
        .filter(Boolean);
    },
    upcomingTracks() {
      return this.upcomingIds
        .map(id => this.trackLookup.get(id))
        .filter(Boolean);
    },
    totalCount() {
      return this.playNextIds.length + this.upcomingIds.length;
    },
    // 队列变化时用它做侦听签名。依赖 upcomingIds / playNextIds 这两个已做
    // 版本感知的 computed，否则 player 不是响应式对象，队列变动不会触发刷新。
    queueSignature() {
      return `${this.upcomingIds.join(',')}|${this.playNextIds.join(',')}`;
    },
  },
  watch: {
    queueSignature() {
      if (this.visible) this.loadTracks();
    },
  },
  beforeUnmount() {
    clearTimeout(this.openTimer);
    clearTimeout(this.closeTimer);
    this.requestGeneration.invalidate();
  },
  methods: {
    onEnter() {
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      if (this.visible) return;
      this.openTimer = setTimeout(() => {
        this.visible = true;
        this.loadTracks();
      }, HOVER_OPEN_DELAY);
    },
    onLeave() {
      clearTimeout(this.openTimer);
      clearTimeout(this.closeTimer);
      this.closeTimer = setTimeout(() => {
        this.visible = false;
      }, HOVER_CLOSE_DELAY);
    },
    artistName(track) {
      if (!track) return '';
      if (Array.isArray(track.ar) && track.ar.length) {
        return track.ar.map(a => a.name).join(' / ');
      }
      return track.artist || track.artists || '';
    },
    resolveLocalTracks(ids) {
      return Promise.all(
        ids.map(id => window.electronAPI?.localMusic?.get(id))
      ).then(tracks => tracks.filter(Boolean));
    },
    resolveStreamingTracks(ids) {
      return Promise.all(
        ids.map(id => window.electronAPI?.streaming?.getTrack(id))
      ).then(tracks => tracks.filter(Boolean));
    },
    resolveRemoteTracks(ids) {
      if (ids.length === 0) return Promise.resolve([]);
      return getTrackDetail(ids.join(',')).then(data => data.songs ?? []);
    },
    async loadTracks() {
      const desired = collectQueueTrackIds(
        this.player.list || [],
        this.player.current ?? 0,
        this.player.playNextList || [],
        UPCOMING_LIMIT
      );
      const missing = getMissingTrackIds(desired, this.tracks);
      if (missing.length === 0 && this.tracks.length > 0) return;

      const requestId = this.requestGeneration.current();
      const isCurrent = () => this.requestGeneration.isCurrent(requestId);
      this.loading = true;
      this.loadError = false;
      try {
        const localIds = missing.filter(
          id => typeof id === 'string' && id.startsWith('local:')
        );
        const streamIds = missing.filter(
          id => typeof id === 'string' && id.startsWith('stream:')
        );
        const remoteIds = missing.filter(id => typeof id === 'number');

        const [local, streaming, remote] = await Promise.all([
          this.resolveLocalTracks(localIds),
          this.resolveStreamingTracks(streamIds),
          this.resolveRemoteTracks(remoteIds),
        ]);
        if (!isCurrent()) return;

        const loaded = [...local, ...streaming, ...remote];
        const byId = new Map(this.tracks.map(t => [t.id, t]));
        for (const track of loaded)
          if (track?.id != null) byId.set(track.id, track);
        this.tracks = [...byId.values()];
      } catch {
        if (!isCurrent()) return;
        this.loadError = true;
      } finally {
        if (isCurrent()) this.loading = false;
      }
    },
    play(id) {
      if (id == null) return;
      this.player.playTrackOnListByID(id);
    },
    clearPlayNext() {
      this.player.clearPlayNextList?.();
    },
    removeFromQueue(id) {
      this.player.removeTrackFromQueue?.(id);
    },
    goToNextTracksPage() {
      if (this.player.isPersonalFM) return;
      this.$route.name === 'next'
        ? this.$router.go(-1)
        : this.$router.push({ name: 'next' });
    },
  },
};
</script>

<style lang="scss" scoped>
.queue-popover {
  position: relative;
  display: flex;
  align-items: center;
}

.queue-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  width: 320px;
  max-width: 78vw;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(128, 128, 128, 0.14);
  border-radius: 12px;
  background: var(--color-navbar-bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(16px);
  overflow: hidden;
  z-index: 1001;
}

.queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px 6px;
  .queue-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text);
  }
  .queue-count {
    font-size: 11px;
    opacity: 0.55;
    color: var(--color-text);
  }
}

.queue-scroll {
  max-height: 340px;
  overflow-y: auto;
  padding: 0 6px 8px;
}

.queue-section {
  padding-top: 4px;
}

.queue-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 6px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.5;
  color: var(--color-text);
}

.queue-clear {
  border: none;
  background: transparent;
  color: var(--color-primary);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  text-transform: none;
  &:hover {
    text-decoration: underline;
  }
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--color-text);
  transition: background 0.15s;

  &:hover {
    background: var(--color-primary-bg-for-transparent);
  }

  &.is-current {
    cursor: default;
    color: var(--color-primary);
    background: var(--color-primary-bg-for-transparent);
  }
}

.queue-index {
  flex: 0 0 20px;
  text-align: center;
  font-size: 11px;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}

.queue-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.queue-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-artist {
  font-size: 11px;
  opacity: 0.55;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.queue-remove {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--color-text);
  opacity: 0.4;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
  &:hover {
    opacity: 1;
    color: var(--color-primary);
  }
}

.queue-tip {
  padding: 10px 8px;
  font-size: 12px;
  opacity: 0.55;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 8px;

  button {
    border: none;
    background: transparent;
    color: var(--color-primary);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
    &:hover {
      text-decoration: underline;
    }
  }

  &.queue-tip-error {
    opacity: 0.8;
  }
}

// 正在播放的小动画
.playing-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 1px;
  height: 12px;
  i {
    width: 2px;
    background: var(--color-primary);
    animation: queue-bar 0.9s ease-in-out infinite;
    &:nth-child(1) {
      height: 60%;
      animation-delay: -0.2s;
    }
    &:nth-child(2) {
      height: 100%;
      animation-delay: -0.5s;
    }
    &:nth-child(3) {
      height: 45%;
    }
  }
}

@keyframes queue-bar {
  0%,
  100% {
    transform: scaleY(0.4);
  }
  50% {
    transform: scaleY(1);
  }
}

.queue-pop-enter-active,
.queue-pop-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}
.queue-pop-enter-from,
.queue-pop-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>

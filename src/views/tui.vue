<template>
  <div class="tui-page" tabindex="0" @keydown="handleKeydown">
    <section class="panel hero">
      <pre class="logo">YesPlayMusic TUI</pre>
      <div class="status-line">
        <span>{{ player.playing ? 'PLAYING' : 'PAUSED' }}</span>
        <span>{{ player.isTrackPending ? 'LOADING' : 'READY' }}</span>
        <span>{{ progressText }}</span>
      </div>
      <div class="track-title">{{ currentTrack.name || 'No Track' }}</div>
      <div class="track-meta">{{ artistsText }} / {{ albumText }}</div>
      <div class="progress">
        <span>{{ currentTimeText }}</span>
        <div class="progress-bar">
          <div :style="{ width: `${progressPercent}%` }"></div>
        </div>
        <span>{{ durationText }}</span>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>QUEUE</h2>
        <ol class="queue">
          <li
            v-for="(track, index) in displayTracks"
            :key="`${track?.id || 'pending'}-${index}`"
            :class="{ active: track?.id === player.displayTrackID }"
            @dblclick="playTrack(track?.id)"
          >
            <span class="index">{{ index + 1 }}</span>
            <span class="name">{{ track?.name || `#${trackIds[index]}` }}</span>
            <span class="artist">{{ formatArtists(track) }}</span>
          </li>
        </ol>
      </div>

      <div class="panel help">
        <h2>KEYS</h2>
        <p><kbd>Space</kbd> play / pause</p>
        <p><kbd>J</kbd> next</p>
        <p><kbd>K</kbd> previous</p>
        <p><kbd>R</kbd> repeat mode</p>
        <p><kbd>S</kbd> shuffle</p>
        <p><kbd>1-9</kbd> play queue item</p>
        <p><kbd>/</kbd> search</p>
        <p><kbd>Esc</kbd> home</p>
      </div>
    </section>
  </div>
</template>

<script>
import { mapState } from 'vuex';
import { getTrackDetail } from '@/api/track';

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${rest}`;
}

export default {
  name: 'Tui',
  data() {
    return {
      tracks: [],
    };
  },
  computed: {
    ...mapState(['player', 'playerVersion']),
    currentTrack() {
      void this.playerVersion;
      return this.player.displayTrack || {};
    },
    trackIds() {
      const current = Math.max(0, this.player.current || 0);
      const nextIds = this.player.list.slice(current, current + 24);
      return [
        ...new Set([this.player.displayTrackID, ...nextIds].filter(Boolean)),
      ];
    },
    displayTracks() {
      return this.trackIds.map(id => {
        if (id === this.currentTrack.id) return this.currentTrack;
        return this.tracks.find(track => track.id === id) || { id };
      });
    },
    artistsText() {
      return this.formatArtists(this.currentTrack) || 'Unknown Artist';
    },
    albumText() {
      return this.currentTrack.al?.name || 'Unknown Album';
    },
    currentTimeText() {
      return formatTime(this.player.progress);
    },
    durationText() {
      return formatTime(this.player.currentTrackDuration);
    },
    progressPercent() {
      const duration = this.player.currentTrackDuration || 0;
      if (duration <= 0) return 0;
      return Math.min(
        100,
        Math.max(0, (this.player.progress / duration) * 100)
      );
    },
    progressText() {
      return `${this.currentTimeText}/${this.durationText}`;
    },
  },
  watch: {
    trackIds: {
      immediate: true,
      handler() {
        this.loadTracks();
      },
    },
  },
  mounted() {
    this.$el.focus();
  },
  methods: {
    formatArtists(track) {
      return (track?.ar || [])
        .map(artist => artist?.name)
        .filter(Boolean)
        .join(', ');
    },
    loadTracks() {
      const loadedIds = new Set(this.tracks.map(track => track.id));
      const missingIds = this.trackIds.filter(
        id => id && id !== this.currentTrack.id && !loadedIds.has(id)
      );
      if (missingIds.length === 0) return;
      getTrackDetail(missingIds.join(',')).then(data => {
        const nextTracks = data.songs.filter(track => !loadedIds.has(track.id));
        this.tracks.push(...nextTracks);
      });
    },
    playTrack(id) {
      if (!id) return;
      this.player.playTrackOnListByID(id);
    },
    handleKeydown(event) {
      const key = event.key.toLowerCase();
      if (event.key === ' ') {
        event.preventDefault();
        this.player.playOrPause();
      } else if (key === 'j') {
        this.player.playNextTrack();
      } else if (key === 'k') {
        this.player.playPrevTrack();
      } else if (key === 'r') {
        this.player.switchRepeatMode();
      } else if (key === 's') {
        this.player.shuffle = !this.player.shuffle;
      } else if (/^[1-9]$/.test(key)) {
        this.playTrack(this.displayTracks[Number(key) - 1]?.id);
      } else if (key === '/') {
        event.preventDefault();
        this.$router.push({ name: 'search' });
      } else if (event.key === 'Escape') {
        this.$router.push({ name: 'home' });
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.tui-page {
  color: #d8fdd8;
  min-height: calc(100vh - 160px);
  padding: 32px;
  border: 1px solid rgba(116, 255, 116, 0.32);
  border-radius: 18px;
  background:
    linear-gradient(rgba(116, 255, 116, 0.04) 50%, transparent 50%),
    radial-gradient(
      circle at top left,
      rgba(116, 255, 116, 0.16),
      transparent 36%
    ),
    #071107;
  background-size:
    100% 4px,
    auto,
    auto;
  box-shadow: inset 0 0 0 1px rgba(216, 253, 216, 0.08);
  font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
}

.panel {
  border: 1px solid rgba(116, 255, 116, 0.26);
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.42);
  padding: 20px;
}

.hero {
  margin-bottom: 20px;
}

.logo {
  color: #74ff74;
  font-size: 28px;
  letter-spacing: 0.08em;
  margin: 0 0 16px;
}

.status-line {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
  span {
    border: 1px solid rgba(116, 255, 116, 0.28);
    border-radius: 999px;
    color: #74ff74;
    padding: 4px 10px;
  }
}

.track-title {
  color: #ffffff;
  font-size: 34px;
  font-weight: 700;
  margin-bottom: 8px;
}

.track-meta {
  color: rgba(216, 253, 216, 0.72);
}

.progress {
  display: grid;
  grid-template-columns: 52px 1fr 52px;
  gap: 12px;
  align-items: center;
  margin-top: 22px;
}

.progress-bar {
  height: 10px;
  border: 1px solid rgba(116, 255, 116, 0.44);
  border-radius: 999px;
  overflow: hidden;
  div {
    height: 100%;
    background: #74ff74;
  }
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
}

h2 {
  color: #74ff74;
  font-size: 16px;
  letter-spacing: 0.16em;
  margin: 0 0 14px;
}

.queue {
  list-style: none;
  margin: 0;
  padding: 0;
  li {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) minmax(120px, 0.5fr);
    gap: 12px;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: default;
  }
  li.active {
    color: #071107;
    background: #74ff74;
  }
  .name,
  .artist {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .artist {
    opacity: 0.72;
  }
}

kbd {
  border: 1px solid rgba(116, 255, 116, 0.34);
  border-radius: 6px;
  color: #74ff74;
  padding: 2px 7px;
}

.help p {
  margin: 10px 0;
}

@media (max-width: 900px) {
  .tui-page {
    padding: 18px;
  }
  .grid {
    grid-template-columns: 1fr;
  }
  .track-title {
    font-size: 26px;
  }
}
</style>

<template>
  <div class="streaming">
    <div class="header">
      <div>
        <h1>{{ $t('streaming.title') }}</h1>
        <p>{{ $t('streaming.description') }}</p>
      </div>
    </div>

    <p v-if="!isElectron" class="state">{{ $t('streaming.desktopOnly') }}</p>

    <template v-if="isElectron && connections.length">
      <div class="server-row">
        <label>
          {{ $t('streaming.server') }}
          <select
            v-model="activeConnectionId"
            @change="selectConnection(activeConnectionId)"
          >
            <option
              v-for="connection in connections"
              :key="connection.id"
              :value="connection.id"
            >
              {{ connection.name }} · {{ connection.provider }}
            </option>
          </select>
        </label>
        <label>
          {{ $t('streaming.library') }}
          <select v-model="activeLibraryId" @change="loadTracks(true)">
            <option value="">{{ $t('streaming.allMusic') }}</option>
            <option
              v-for="library in libraries"
              :key="library.id"
              :value="library.id"
            >
              {{ library.name }}
            </option>
          </select>
        </label>
      </div>

      <div class="toolbar">
        <form class="search" @submit.prevent="loadTracks(true)">
          <input
            v-model="search"
            type="search"
            maxlength="256"
            :placeholder="$t('streaming.search')"
          />
          <button type="submit">{{ $t('streaming.searchAction') }}</button>
        </form>
        <button :disabled="tracks.length === 0" @click="playAll">
          <svg-icon icon-class="play" />
          {{ $t('streaming.playAll') }}
        </button>
      </div>

      <p v-if="loading && tracks.length === 0" class="state">
        {{ $t('streaming.loading') }}
      </p>
      <p v-else-if="loadError" class="state error">{{ loadError }}</p>
      <p v-else-if="tracks.length === 0" class="state">
        {{ $t('streaming.empty') }}
      </p>
      <TrackList
        v-else
        :id="activeConnectionId"
        :tracks="tracks"
        :column-number="1"
        type="streaming"
        dbclick-track-func="playStreaming"
      />
      <button
        v-if="tracks.length < total"
        class="load-more"
        :disabled="loading"
        @click="loadTracks(false)"
      >
        {{ loading ? $t('streaming.loading') : $t('streaming.loadMore') }}
      </button>
    </template>
  </div>
</template>

<script>
import { isElectron } from '@/utils/env';
import SvgIcon from '@/components/SvgIcon.vue';
import TrackList from '@/components/TrackList.vue';

const PAGE_SIZE = 100;

export default {
  name: 'Streaming',
  components: { SvgIcon, TrackList },
  data() {
    return {
      isElectron,
      connections: [],
      activeConnectionId: '',
      libraries: [],
      activeLibraryId: '',
      tracks: [],
      total: 0,
      search: '',
      loading: false,
      loadingConnections: true,
      loadError: '',
    };
  },
  created() {
    this.loadConnections();
  },
  activated() {
    if (!this.loadingConnections) this.loadConnections();
  },
  methods: {
    async loadConnections() {
      if (!this.isElectron || !window.electronAPI?.streaming) {
        this.loadingConnections = false;
        return;
      }
      try {
        this.connections =
          (await window.electronAPI.streaming.listConnections()) || [];
        if (this.connections.length) {
          const stillAvailable = this.connections.some(
            item => item.id === this.activeConnectionId
          );
          await this.selectConnection(
            stillAvailable ? this.activeConnectionId : this.connections[0].id
          );
        } else {
          this.$router.replace({ name: 'settings' });
        }
      } catch (error) {
        this.loadError = error?.message || this.$t('streaming.loadFailed');
      } finally {
        this.loadingConnections = false;
      }
    },
    async selectConnection(connectionId) {
      if (!connectionId) return;
      this.activeConnectionId = connectionId;
      this.activeLibraryId = '';
      this.loadError = '';
      try {
        this.libraries =
          (await window.electronAPI.streaming.getLibraries(connectionId)) || [];
        await this.loadTracks(true);
      } catch (error) {
        this.libraries = [];
        this.tracks = [];
        this.loadError = error?.message || this.$t('streaming.loadFailed');
      }
    },
    async loadTracks(reset) {
      if (!this.activeConnectionId || this.loading) return;
      this.loading = true;
      this.loadError = '';
      try {
        const startIndex = reset ? 0 : this.tracks.length;
        const result = await window.electronAPI.streaming.getTracks({
          connectionId: this.activeConnectionId,
          parentId: this.activeLibraryId,
          search: this.search,
          startIndex,
          limit: PAGE_SIZE,
        });
        this.tracks = reset
          ? result.tracks
          : [...this.tracks, ...result.tracks];
        this.total = result.total;
      } catch (error) {
        if (reset) this.tracks = [];
        this.loadError = error?.message || this.$t('streaming.loadFailed');
      } finally {
        this.loading = false;
      }
    },
    playAll() {
      if (!this.tracks.length) return;
      this.$store.state.player.replacePlaylist(
        this.tracks.map(track => track.id),
        this.activeConnectionId,
        'streaming',
        'first',
        { name: this.$t('streaming.title') }
      );
    },
  },
};
</script>

<style lang="scss" scoped>
.streaming {
  padding-top: 32px;
}

.header,
.server-row,
.toolbar,
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.header {
  align-items: flex-end;
  margin-bottom: 28px;

  h1 {
    margin: 0 0 8px;
    color: var(--color-text);
    font-size: 42px;
  }

  p {
    margin: 0;
    color: var(--color-text);
    opacity: 0.68;
  }
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 9px 14px;
  color: var(--color-text);
  background: var(--color-secondary-bg);
  border-radius: 8px;
  font-weight: 600;

  &.primary {
    color: var(--color-primary-bg);
    background: var(--color-primary);
  }

  &.danger {
    color: #d14343;
  }

  &:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .svg-icon {
    width: 15px;
    height: 15px;
  }
}

.connection-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 28px;
  padding: 20px;
  background: var(--color-secondary-bg);
  border-radius: 12px;

  .form-actions,
  .error {
    grid-column: 1 / -1;
  }
}

label {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
}

input,
select {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 10px;
  color: var(--color-text);
  background: var(--color-body-bg);
  border: 1px solid var(--color-secondary-bg);
  border-radius: 7px;
}

.server-row,
.toolbar {
  margin-bottom: 20px;
}

.server-row label {
  max-width: 360px;
}

.toolbar .search {
  display: flex;
  flex: 1;
  max-width: 520px;
  gap: 8px;
}

.state {
  padding: 64px 16px;
  color: var(--color-text);
  text-align: center;
  opacity: 0.62;
}

.error {
  color: #d14343;
}

.load-more {
  margin: 24px auto;
}
</style>

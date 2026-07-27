<template>
  <div class="streaming-server-settings">
    <div class="settings-header">
      <div>
        <div class="title">{{ $t('streaming.serverSettings') }}</div>
        <div class="description">{{ $t('streaming.description') }}</div>
      </div>
      <button @click="showConnectionForm = !showConnectionForm">
        <svg-icon icon-class="plus" />
        {{ $t('streaming.addServer') }}
      </button>
    </div>

    <form
      v-if="showConnectionForm"
      class="connection-form"
      @submit.prevent="connect"
    >
      <label>
        {{ $t('streaming.provider') }}
        <select v-model="form.provider">
          <option value="emby">Emby</option>
          <option value="jellyfin">Jellyfin</option>
        </select>
      </label>
      <label>
        {{ $t('streaming.connectionName') }}
        <input
          v-model.trim="form.name"
          maxlength="128"
          :placeholder="$t('streaming.connectionNamePlaceholder')"
        />
      </label>
      <label>
        {{ $t('streaming.serverUrl') }}
        <input
          v-model.trim="form.serverUrl"
          type="url"
          required
          maxlength="2048"
          placeholder="http://192.168.1.10:8096"
        />
      </label>
      <label>
        {{ $t('streaming.username') }}
        <input v-model="form.username" required maxlength="256" />
      </label>
      <label>
        {{ $t('streaming.password') }}
        <input v-model="form.password" type="password" maxlength="4096" />
      </label>
      <div class="form-actions">
        <button type="button" @click="showConnectionForm = false">
          {{ $t('streaming.cancel') }}
        </button>
        <button class="primary" type="submit" :disabled="connecting">
          {{
            connecting ? $t('streaming.connecting') : $t('streaming.connect')
          }}
        </button>
      </div>
      <p v-if="connectionError" class="error">{{ connectionError }}</p>
    </form>

    <p v-if="loading" class="state">{{ $t('streaming.loading') }}</p>
    <p v-else-if="connections.length === 0" class="state">
      {{ $t('streaming.noServers') }}
    </p>
    <div v-else class="connections">
      <div
        v-for="connection in connections"
        :key="connection.id"
        class="connection"
      >
        <div>
          <div class="connection-name">{{ connection.name }}</div>
          <div class="connection-meta">
            {{ connection.provider }} · {{ connection.serverUrl }}
          </div>
        </div>
        <button class="danger" @click="disconnect(connection.id)">
          {{ $t('streaming.disconnect') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import SvgIcon from '@/components/SvgIcon.vue';
import { publishStreamingConnections } from '@/utils/streamingConnections';

export default {
  name: 'StreamingServerSettings',
  components: { SvgIcon },
  data() {
    return {
      connections: [],
      loading: true,
      connecting: false,
      showConnectionForm: false,
      connectionError: '',
      form: {
        provider: 'emby',
        name: '',
        serverUrl: '',
        username: '',
        password: '',
      },
    };
  },
  created() {
    this.loadConnections();
  },
  methods: {
    async loadConnections() {
      try {
        this.connections =
          (await window.electronAPI.streaming.listConnections()) || [];
        publishStreamingConnections(this.connections);
      } finally {
        this.loading = false;
      }
    },
    async connect() {
      if (this.connecting) return;
      this.connecting = true;
      this.connectionError = '';
      try {
        await window.electronAPI.streaming.connect({ ...this.form });
        this.form.password = '';
        this.showConnectionForm = false;
        await this.loadConnections();
      } catch (error) {
        this.connectionError =
          error?.message || this.$t('streaming.connectionFailed');
      } finally {
        this.connecting = false;
      }
    },
    async disconnect(connectionId) {
      if (!confirm(this.$t('streaming.disconnectConfirm'))) return;
      this.connections =
        (await window.electronAPI.streaming.disconnect(connectionId)) || [];
      publishStreamingConnections(this.connections);
    },
  },
};
</script>

<style lang="scss" scoped>
.streaming-server-settings {
  padding: 18px 20px;
  background: var(--color-secondary-bg);
  border-radius: 12px;
}

.settings-header,
.connection,
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.title,
.connection-name {
  color: var(--color-text);
  font-weight: 600;
}

.description,
.connection-meta {
  margin-top: 5px;
  color: var(--color-text);
  font-size: 13px;
  opacity: 0.62;
}

button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 12px;
  color: var(--color-text);
  background: var(--color-body-bg);
  border-radius: 7px;
  font-weight: 600;

  &.primary {
    color: var(--color-primary-bg);
    background: var(--color-primary);
  }

  &.danger {
    color: #d14343;
  }

  &:disabled {
    opacity: 0.45;
  }

  .svg-icon {
    width: 14px;
    height: 14px;
  }
}

.connection-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--color-body-bg);

  .form-actions,
  .error {
    grid-column: 1 / -1;
  }
}

label {
  display: flex;
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
  border-radius: 7px;
}

.connections {
  margin-top: 14px;
}

.connection {
  padding: 12px 0;
  border-top: 1px solid var(--color-body-bg);
}

.state {
  margin: 18px 0 0;
  color: var(--color-text);
  text-align: center;
  opacity: 0.62;
}

.error {
  margin: 0;
  color: #d14343;
}

@media (max-width: 720px) {
  .connection-form {
    grid-template-columns: 1fr;
  }
}
</style>

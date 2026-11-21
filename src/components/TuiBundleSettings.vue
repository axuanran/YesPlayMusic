<template>
  <div class="tui-bundle-settings">
    <div class="settings-header">
      <div>
        <div class="title">{{ $t('settings.tuiBundle.title') }}</div>
        <div class="description">{{
          $t('settings.tuiBundle.description')
        }}</div>
      </div>
      <div class="actions">
        <button v-if="!status.installed" :disabled="busy" @click="install">
          {{
            busy
              ? $t('settings.tuiBundle.downloading')
              : $t('settings.tuiBundle.download')
          }}
        </button>
        <template v-else>
          <button :disabled="busy" @click="install">
            {{
              busy
                ? $t('settings.tuiBundle.downloading')
                : $t('settings.tuiBundle.reinstall')
            }}
          </button>
          <button class="secondary" :disabled="busy" @click="openFolder">
            {{ $t('settings.tuiBundle.openFolder') }}
          </button>
          <button class="danger" :disabled="busy" @click="remove">
            {{ $t('settings.tuiBundle.remove') }}
          </button>
        </template>
      </div>
    </div>

    <div class="status-row">
      <span v-if="status.installed" class="badge ok">
        {{ $t('settings.tuiBundle.installed') }}
      </span>
      <span v-else class="badge">
        {{ $t('settings.tuiBundle.notInstalled') }}
      </span>
      <span v-if="status.version" class="meta">
        {{ $t('settings.tuiBundle.version') }} {{ status.version }}
      </span>
      <span v-if="status.installed && status.sizeBytes" class="meta">
        {{ formatSize(status.sizeBytes) }}
      </span>
      <span class="meta">{{ status.platform }}</span>
    </div>

    <div
      v-if="busy"
      class="progress"
      role="progressbar"
      :aria-valuenow="percent"
    >
      <div class="progress-bar" :style="{ width: percent + '%' }"></div>
      <span class="progress-label">{{ phaseLabel }}</span>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <p v-if="!status.installed" class="hint">
      {{ $t('settings.tuiBundle.hint') }}
    </p>
  </div>
</template>

<script>
import { isElectron } from '@/utils/env';

export default {
  name: 'TuiBundleSettings',
  data() {
    return {
      status: {
        installed: false,
        version: null,
        sizeBytes: 0,
        platform: '',
      },
      progress: null,
      error: '',
      disposing: null,
    };
  },
  computed: {
    busy() {
      return this.progress !== null;
    },
    percent() {
      return this.progress?.percent ?? 0;
    },
    phaseLabel() {
      const phase = this.progress?.phase;
      if (!phase) return '';
      const label = this.$t(`settings.tuiBundle.phase.${phase}`);
      return typeof label === 'string' ? label : phase;
    },
  },
  async mounted() {
    if (!isElectron || !window.electronAPI?.tuiBundle) return;
    await this.refresh();
    this.disposing = window.electronAPI.tuiBundle.onProgress(progress => {
      this.progress = progress;
    });
  },
  beforeUnmount() {
    if (typeof this.disposing === 'function') this.disposing();
  },
  methods: {
    async refresh() {
      try {
        this.status = await window.electronAPI.tuiBundle.getStatus();
      } catch (error) {
        this.error = error?.message || String(error);
      }
    },
    async install() {
      if (this.busy) return;
      this.error = '';
      this.progress = { phase: 'manifest', percent: 0 };
      try {
        this.status = await window.electronAPI.tuiBundle.install();
      } catch (error) {
        this.error = error?.message || String(error);
      } finally {
        this.progress = null;
        await this.refresh();
      }
    },
    async remove() {
      if (this.busy) return;
      this.error = '';
      try {
        this.status = await window.electronAPI.tuiBundle.uninstall();
      } catch (error) {
        this.error = error?.message || String(error);
      }
    },
    openFolder() {
      window.electronAPI.tuiBundle.openFolder();
    },
    formatSize(bytes) {
      if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
      return `${Math.round(bytes / 1024 ** 2)} MB`;
    },
  },
};
</script>

<style lang="scss" scoped>
.tui-bundle-settings {
  .settings-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;

      button.secondary {
        opacity: 0.8;
      }

      button.danger {
        color: var(--color-red);
      }
    }
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 12px;

    .badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
      background: var(--color-secondary-bg);
    }

    .badge.ok {
      color: var(--color-primary);
    }

    .meta {
      font-size: 12px;
      opacity: 0.6;
    }
  }

  .progress {
    position: relative;
    height: 6px;
    border-radius: 3px;
    background: var(--color-secondary-bg);
    margin-top: 14px;

    .progress-bar {
      height: 100%;
      border-radius: 3px;
      background: var(--color-primary);
      transition: width 0.2s ease;
    }

    .progress-label {
      display: block;
      margin-top: 6px;
      font-size: 12px;
      opacity: 0.7;
    }
  }

  .error {
    margin-top: 12px;
    color: var(--color-red);
    font-size: 13px;
  }

  .hint {
    margin-top: 12px;
    font-size: 12px;
    opacity: 0.6;
    line-height: 1.6;
  }
}
</style>

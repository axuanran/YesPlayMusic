<template>
  <div class="plugin-page">
    <div class="container">
      <div class="header">
        <button class="back" @click="$router.push({ name: 'settings' })">
          返回设置
        </button>
        <h1>内置音频解析</h1>
        <p v-if="isCapacitor">
          Android 使用 UI/原生兼容 Provider，可配置直链、兜底与缓存策略
        </p>
        <p v-else>
          完整 Resolver 已随应用内置，可直接配置 Netease、Unblock、LX 等音源
        </p>
      </div>

      <resolver-controls
        :use-audio-resolver="useAudioResolver"
        :is-capacitor="isCapacitor"
        @update:use-audio-resolver="useAudioResolver = $event"
        @clear-cache="clearResolverUiCache"
      />
      <resolver-configuration
        v-if="!isCapacitor"
        @saved="refreshProviderStatus"
      />
      <mobile-resolver-configuration v-else @saved="refreshProviderStatus" />
      <provider-status
        :providers="providerStatus"
        @refresh="refreshProviderStatus"
      />
      <resolve-tester
        :track-id="testTrackId"
        :quality="testQuality"
        :result="testResult"
        @update:track-id="testTrackId = $event"
        @update:quality="testQuality = $event"
        @test="testResolve"
      />
    </div>
  </div>
</template>

<script>
import { mapActions, mapState } from 'vuex';
import { clearResolverCache } from '@/api/audioResolver';
import { isCapacitor } from '@/utils/env';
import {
  getAudioProviderStatus,
  resolveTrackSourceWithProviders,
} from '@/plugins/providers/audio';
import MobileResolverConfiguration from './components/MobileResolverConfiguration.vue';
import ProviderStatus from './components/ProviderStatus.vue';
import ResolverConfiguration from './components/ResolverConfiguration.vue';
import ResolverControls from './components/ResolverControls.vue';
import ResolveTester from './components/ResolveTester.vue';

const resolverEnabledSetting = {
  get() {
    return this.settings.useAudioResolver ?? true;
  },
  set(value) {
    const wasEnabled = this.settings.useAudioResolver === true;
    this.$store.commit('updateSettings', {
      key: 'useAudioResolver',
      value,
    });
    if (value && !wasEnabled) this.refreshProviderStatus();
  },
};

export default {
  name: 'ResolverAdminPlugin',
  components: {
    MobileResolverConfiguration,
    ProviderStatus,
    ResolverConfiguration,
    ResolverControls,
    ResolveTester,
  },
  data() {
    return {
      isCapacitor,
      testTrackId: '',
      testQuality: 'standard',
      testResult: null,
      providerStatus: getAudioProviderStatus(),
    };
  },
  computed: {
    ...mapState(['settings']),
    useAudioResolver: resolverEnabledSetting,
  },
  methods: {
    ...mapActions(['showToast']),
    async clearResolverUiCache() {
      try {
        await clearResolverCache();
        this.refreshProviderStatus();
        this.showToast('已清除音频解析缓存');
      } catch (error) {
        this.showToast(`清除解析缓存失败：${error.message || error}`);
      }
    },
    refreshProviderStatus() {
      this.providerStatus = getAudioProviderStatus();
    },
    async testResolve() {
      if (!this.testTrackId) {
        this.showToast('请输入 trackId');
        return;
      }
      const startedAt = Date.now();
      this.testResult = {
        status: '解析中',
      };
      try {
        const playUrl = await resolveTrackSourceWithProviders(
          Number(this.testTrackId) || this.testTrackId,
          this.testQuality
        );
        this.refreshProviderStatus();
        this.testResult = {
          status: playUrl ? '成功' : '未获取到播放地址',
          durationMs: Date.now() - startedAt,
          playUrl,
        };
      } catch (error) {
        this.refreshProviderStatus();
        this.testResult = {
          status: '失败',
          durationMs: Date.now() - startedAt,
          error: error.message || String(error),
        };
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.plugin-page {
  display: flex;
  justify-content: center;
  margin-top: 32px;
}

.container {
  margin-top: 24px;
  width: 820px;
  max-width: calc(100vw - 48px);
}

.header {
  margin-bottom: 40px;
  color: var(--color-text);

  h1 {
    margin: 20px 0 8px;
    font-size: 36px;
  }

  p {
    margin: 0;
    opacity: 0.68;
  }
}
</style>

<style lang="scss">
.plugin-page {
  .item {
    margin: 24px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--color-text);

    &.vertical {
      align-items: flex-start;
      flex-direction: column;
      gap: 16px;
    }

    .title {
      font-size: 16px;
      font-weight: 500;
      opacity: 0.78;
    }

    .description {
      font-size: 14px;
      margin-top: 0.5em;
      opacity: 0.7;
    }
  }

  .resolver-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;

    input {
      width: 320px;
      max-width: 100%;
    }
  }

  .provider-list {
    width: 100%;
  }

  .provider-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 8px;
    color: var(--color-text);
    background: var(--color-secondary-bg);

    & + .provider-row {
      margin-top: 8px;
    }

    .error {
      color: #e04f5f;
    }
  }

  .test-result {
    max-width: 100%;
    word-break: break-all;
    color: var(--color-text);
    opacity: 0.78;
  }

  button,
  input,
  select {
    color: var(--color-text);
    background: var(--color-secondary-bg);
    padding: 8px 12px;
    font-weight: 600;
    border: none;
    border-radius: 8px;
  }

  button {
    transition: 0.2s;

    &:hover {
      transform: scale(1.06);
    }

    &:active {
      transform: scale(0.94);
    }
  }

  .toggle input {
    opacity: 0;
    position: absolute;
  }

  .toggle input + label {
    position: relative;
    display: inline-block;
    user-select: none;
    transition: 0.4s ease;
    height: 32px;
    width: 52px;
    background: var(--color-secondary-bg);
    border-radius: 8px;
  }

  .toggle input + label:before {
    content: '';
    position: absolute;
    display: block;
    transition: 0.2s cubic-bezier(0.24, 0, 0.5, 1);
    height: 32px;
    width: 52px;
    top: 0;
    left: 0;
    border-radius: 8px;
  }

  .toggle input + label:after {
    content: '';
    position: absolute;
    display: block;
    box-shadow:
      0 0 0 1px hsla(0, 0%, 0%, 0.02),
      0 4px 0 0 hsla(0, 0%, 0%, 0.01),
      0 4px 9px 0 hsla(0, 0%, 0%, 0.08),
      0 3px 3px 0 hsla(0, 0%, 0%, 0.03);
    transition: 0.35s cubic-bezier(0.54, 1.6, 0.5, 1);
    background: #fff;
    height: 20px;
    width: 20px;
    top: 6px;
    left: 6px;
    border-radius: 6px;
  }

  .toggle input:checked + label:before {
    background: var(--color-primary-gradient);
    transition: width 0.2s cubic-bezier(0, 0, 0, 0.1);
  }

  .toggle input:checked + label:after {
    left: 26px;
  }
}
</style>

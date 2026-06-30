<template>
  <div class="plugin-page">
    <div class="container">
      <div class="header">
        <button class="back" @click="$router.push({ name: 'settings' })">
          返回设置
        </button>
        <h1>Resolver Admin</h1>
        <p>音频解析服务管理入口</p>
      </div>

      <div class="item">
        <div class="left">
          <div class="title">启用音频解析</div>
          <div class="description">由音频解析服务接管播放地址解析。</div>
        </div>
        <div class="right">
          <div class="toggle">
            <input
              id="plugin-use-audio-resolver"
              v-model="useAudioResolver"
              type="checkbox"
              name="plugin-use-audio-resolver"
            />
            <label for="plugin-use-audio-resolver"></label>
          </div>
        </div>
      </div>

      <div class="item vertical">
        <div class="left">
          <div class="title">Resolver 地址</div>
          <div class="description">默认地址为 http://127.0.0.1:27232。</div>
        </div>
        <div class="resolver-actions">
          <input
            v-model="audioResolverUrl"
            type="text"
            placeholder="http://127.0.0.1:27232"
          />
          <button @click="openResolverAdminPanel">打开管理面板</button>
          <button @click="syncFrontendCookieToResolver">
            从前端获取 Cookie
          </button>
          <button @click="clearResolverBackendCache">清后端缓存</button>
        </div>
      </div>

      <div class="item vertical">
        <div class="left">
          <div class="title">Provider 状态</div>
          <div class="description">当前音频 Provider 按优先级执行。</div>
        </div>
        <div class="provider-list">
          <div
            v-for="provider in providerStatus"
            :key="provider.id"
            class="provider-row"
          >
            <span>{{ provider.name }}</span>
            <span>{{ provider.active ? '启用' : '停用' }}</span>
            <span>优先级 {{ provider.priority }}</span>
            <span v-if="provider.lastError" class="error">
              {{ provider.lastError }}
            </span>
          </div>
        </div>
      </div>

      <div class="item vertical">
        <div class="left">
          <div class="title">测试解析</div>
          <div class="description">输入 trackId 验证当前 provider 链路。</div>
        </div>
        <div class="resolver-actions">
          <input v-model="testTrackId" type="text" placeholder="trackId" />
          <select v-model="testQuality">
            <option value="standard">standard</option>
            <option value="exhigh">exhigh</option>
            <option value="lossless">lossless</option>
            <option value="hires">hires</option>
          </select>
          <button @click="testResolve">测试</button>
        </div>
        <div v-if="testResult" class="test-result">{{ testResult }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapActions, mapState } from 'vuex';
import {
  clearResolverCache,
  syncCookieToResolverWithRetry,
} from '@/api/audioResolver';
import { getCookieString } from '@/utils/auth';
import {
  getAudioProviderStatus,
  resolveTrackSourceWithProviders,
} from '@/plugins/providers/audio';

const setting = (key, defaultValue) => ({
  get() {
    if (this.settings[key] === undefined) return defaultValue;
    return this.settings[key];
  },
  set(value) {
    this.$store.commit('updateSettings', { key, value });
  },
});

export default {
  name: 'ResolverAdminPlugin',
  data() {
    return {
      testTrackId: '',
      testQuality: 'standard',
      testResult: '',
      providerStatus: getAudioProviderStatus(),
    };
  },
  computed: {
    ...mapState(['settings']),
    useAudioResolver: setting('useAudioResolver', false),
    audioResolverUrl: setting('audioResolverUrl', 'http://127.0.0.1:27232'),
  },
  methods: {
    ...mapActions(['showToast']),
    resolverAdminUrl() {
      const base = (this.audioResolverUrl || 'http://127.0.0.1:27232').replace(
        /\/+$/,
        ''
      );
      return `${base}/admin/#/`;
    },
    openResolverAdminPanel() {
      const url = this.resolverAdminUrl();
      if (window.electronAPI?.app?.openExternalUrl) {
        window.electronAPI.app.openExternalUrl(url);
        return;
      }
      window.open(url, '_blank', 'noopener');
    },
    async clearResolverBackendCache() {
      try {
        await clearResolverCache();
        this.refreshProviderStatus();
        this.showToast('已清除 resolver 后端缓存');
      } catch (error) {
        this.showToast(`清除后端缓存失败：${error.message || error}`);
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
      this.testResult = '解析中...';
      try {
        const playUrl = await resolveTrackSourceWithProviders(
          Number(this.testTrackId) || this.testTrackId,
          this.testQuality
        );
        this.refreshProviderStatus();
        this.testResult = playUrl || '未获取到播放地址';
      } catch (error) {
        this.refreshProviderStatus();
        this.testResult = error.message || String(error);
      }
    },
    async syncFrontendCookieToResolver() {
      try {
        const cookie = getCookieString();
        if (!cookie) {
          this.showToast('前端没有可同步的 Cookie');
          return;
        }
        await syncCookieToResolverWithRetry(cookie, {
          timeoutMs: 10000,
          intervalMs: 1000,
        });
        this.refreshProviderStatus();
        this.showToast('已从前端同步 Cookie 到 resolver');
      } catch (error) {
        this.showToast(`同步 Cookie 失败：${error.message || error}`);
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
  width: 720px;
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
    0 4px 0px 0 hsla(0, 0%, 0%, 0.01),
    0 4px 9px hsla(0, 0%, 0%, 0.08),
    0 3px 3px hsla(0, 0%, 0%, 0.03);
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
</style>

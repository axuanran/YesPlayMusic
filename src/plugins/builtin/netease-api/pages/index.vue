<template>
  <div class="plugin-page netease-api-page">
    <div class="container">
      <div class="header">
        <button class="back" @click="$router.push({ name: 'settings' })">
          返回设置
        </button>
        <h1>网易云音乐 API</h1>
        <p>
          可填写 NeteaseCloudMusicApiEnhanced 自建服务或 Vercel / Serverless
          部署的根地址。留空时继续使用当前平台的默认 API。
        </p>
      </div>

      <div class="item vertical">
        <div>
          <div class="title">自定义 API 地址</div>
          <div class="description">
            示例：https://your-api.vercel.app。保存后立即生效，无需重启应用。
          </div>
        </div>
        <div class="api-actions">
          <input
            v-model.trim="apiUrlDraft"
            type="url"
            placeholder="https://your-api.vercel.app"
            autocomplete="off"
            spellcheck="false"
            @keyup.enter="saveApiUrl"
          />
          <button @click="saveApiUrl">保存</button>
          <button @click="resetApiUrl">恢复默认</button>
        </div>
        <div class="status"> 当前：{{ neteaseApiUrl || '默认 API' }} </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapActions, mapState } from 'vuex';

function normalizeApiUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('/')) return url.replace(/\/+$/, '') || '/';
  if (!/^https?:\/\//i.test(url)) return null;
  return url.replace(/\/+$/, '');
}

export default {
  name: 'NeteaseApiPlugin',
  data() {
    return {
      apiUrlDraft: '',
    };
  },
  computed: {
    ...mapState(['settings']),
    neteaseApiUrl() {
      return this.settings.neteaseApiUrl || '';
    },
  },
  created() {
    this.apiUrlDraft = this.neteaseApiUrl;
  },
  methods: {
    ...mapActions(['showToast']),
    saveApiUrl() {
      const value = normalizeApiUrl(this.apiUrlDraft);
      if (value === null) {
        this.showToast('API 地址必须以 http://、https:// 或 / 开头');
        return;
      }
      this.apiUrlDraft = value;
      this.$store.commit('updateSettings', {
        key: 'neteaseApiUrl',
        value,
      });
      this.showToast(value ? '网易云音乐 API 地址已更新' : '已恢复默认 API');
    },
    resetApiUrl() {
      this.apiUrlDraft = '';
      this.saveApiUrl();
    },
  },
};
</script>

<style lang="scss" scoped>
.netease-api-page {
  display: flex;
  justify-content: center;
  margin-top: 32px;
  color: var(--color-text);
}

.container {
  margin-top: 24px;
  width: 720px;
  max-width: calc(100vw - 48px);
}

.header {
  margin-bottom: 40px;

  h1 {
    margin: 20px 0 8px;
    font-size: 36px;
  }

  p {
    margin: 0;
    line-height: 1.7;
    opacity: 0.68;
  }
}

.item {
  margin: 24px 0;

  &.vertical {
    display: flex;
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }
}

.title {
  font-size: 16px;
  font-weight: 500;
  opacity: 0.78;
}

.description,
.status {
  font-size: 14px;
  margin-top: 0.5em;
  opacity: 0.7;
}

.status {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.api-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;

  input {
    flex: 1 1 360px;
    min-width: 0;
  }
}

button,
input {
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
    transform: scale(1.04);
  }

  &:active {
    transform: scale(0.96);
  }
}
</style>

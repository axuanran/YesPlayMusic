<template>
  <section class="resolver-configuration">
    <h3>解析配置</h3>
    <p class="section-description">
      这些设置直接写入应用内置 Resolver，无需填写解析服务地址。
    </p>

    <div v-if="loading" class="config-message">正在读取解析配置…</div>
    <div v-else-if="loadError" class="config-message error-message">
      <span>{{ loadError }}</span>
      <button @click="loadConfig">重试</button>
    </div>

    <template v-else>
      <h4>基础设置</h4>
      <div class="config-grid">
        <label class="field checkbox-field">
          <span>代理播放流</span>
          <input v-model="config.audio.proxyStream" type="checkbox" />
        </label>

        <label class="field">
          <span>默认解析音质</span>
          <select v-model="config.audio.defaultQuality">
            <option value="standard">标准</option>
            <option value="exhigh">极高</option>
            <option value="lossless">无损</option>
            <option value="hires">Hi-Res</option>
            <option value="jyeffect">高清环绕声</option>
            <option value="sky">沉浸环绕声</option>
            <option value="jymaster">超清母带</option>
          </select>
        </label>

        <label class="field">
          <span>解析缓存时间（秒）</span>
          <input
            v-model.number="config.audio.cacheTtl"
            type="number"
            min="1"
            step="60"
          />
        </label>

        <label class="field">
          <span>缓存目录</span>
          <input
            v-model.trim="config.audio.cacheDir"
            type="text"
            placeholder="留空使用应用默认目录"
          />
        </label>
      </div>

      <label class="field full-width-field">
        <span>Provider 顺序</span>
        <input
          v-model="providerOrderText"
          type="text"
          placeholder="netease, lx, unblock, fallback"
        />
        <small>按从左到右的顺序尝试，多个 Provider 用英文逗号分隔。</small>
      </label>

      <h4>UnblockNeteaseMusic</h4>
      <div class="config-grid">
        <label class="field checkbox-field">
          <span>启用 Unblock Provider</span>
          <input v-model="config.audio.unblock.enabled" type="checkbox" />
        </label>

        <label class="field checkbox-field">
          <span>允许 FLAC</span>
          <input v-model="config.audio.unblock.enableFlac" type="checkbox" />
        </label>

        <label class="field">
          <span>搜索模式</span>
          <select v-model="config.audio.unblock.searchMode">
            <option value="fast-first">速度优先</option>
            <option value="order-first">音源顺序优先</option>
          </select>
        </label>

        <label class="field">
          <span>yt-dlp 路径</span>
          <input
            v-model.trim="config.audio.unblock.ytDlExe"
            type="text"
            placeholder="yt-dlp"
          />
        </label>
      </div>

      <label class="field full-width-field">
        <span>Unblock 音源</span>
        <input
          v-model="config.audio.unblock.source"
          type="text"
          placeholder="ytdl, bilibili, pyncm, kugou"
        />
        <small>多个音源用英文逗号分隔。</small>
      </label>

      <label class="field full-width-field">
        <span>Unblock 代理</span>
        <input
          v-model.trim="config.audio.unblock.proxyUri"
          type="text"
          placeholder="http://127.0.0.1:7890"
        />
      </label>

      <div class="config-grid">
        <label class="field">
          <span>JOOX Cookie</span>
          <input
            v-model="config.audio.unblock.jooxCookie"
            type="password"
            autocomplete="off"
          />
        </label>

        <label class="field">
          <span>QQ Cookie</span>
          <input
            v-model="config.audio.unblock.qqCookie"
            type="password"
            autocomplete="off"
          />
        </label>
      </div>

      <h4>洛雪音源</h4>
      <div class="config-grid">
        <label class="field checkbox-field">
          <span>启用 LX Provider</span>
          <input v-model="config.audio.lx.enabled" type="checkbox" />
        </label>

        <label class="field">
          <span>请求超时（ms）</span>
          <input
            v-model.number="config.audio.lx.timeoutMs"
            type="number"
            min="1000"
            step="1000"
          />
        </label>

        <label class="field">
          <span>脚本缓存（ms）</span>
          <input
            v-model.number="config.audio.lx.cacheMs"
            type="number"
            min="0"
            step="60000"
          />
        </label>
      </div>

      <div class="source-list">
        <div
          v-for="(source, index) in config.audio.lx.sources"
          :key="`lx-source-${index}`"
          class="source-card"
        >
          <div class="source-card-header">
            <strong>{{ source.name || `LX Source ${index + 1}` }}</strong>
            <label class="source-enabled">
              <span>启用</span>
              <input v-model="source.enabled" type="checkbox" />
            </label>
          </div>

          <div class="config-grid">
            <label class="field">
              <span>名称</span>
              <input v-model.trim="source.name" type="text" />
            </label>

            <label class="field">
              <span>Source ID</span>
              <input
                v-model.trim="source.source"
                type="text"
                placeholder="kw"
              />
            </label>
          </div>

          <label class="field full-width-field">
            <span>脚本 URL / 本地路径</span>
            <input
              v-model.trim="source.scriptUrl"
              type="text"
              placeholder="https://example.com/lx-source.js"
            />
          </label>

          <div class="source-actions">
            <button :disabled="index === 0" @click="moveLxSource(index, -1)">
              上移
            </button>
            <button
              :disabled="index === config.audio.lx.sources.length - 1"
              @click="moveLxSource(index, 1)"
            >
              下移
            </button>
            <button @click="removeLxSource(index)">删除</button>
          </div>
        </div>
      </div>

      <button class="add-source" @click="addLxSource">添加洛雪音源</button>

      <div class="config-actions">
        <button :disabled="saving" @click="saveConfig">
          {{ saving ? '保存中…' : '保存解析配置' }}
        </button>
        <button :disabled="saving" @click="loadConfig">重新读取</button>
      </div>
    </template>
  </section>
</template>

<script>
import { mapActions } from 'vuex';
import { getResolverConfig, updateResolverConfig } from '@/api/audioResolver';

const DEFAULT_PROVIDER_ORDER = ['netease', 'lx', 'unblock', 'fallback'];
const DEFAULT_UNBLOCK = {
  enabled: true,
  source: 'ytdl, bilibili, pyncm, kugou',
  enableFlac: false,
  proxyUri: '',
  searchMode: 'fast-first',
  jooxCookie: '',
  qqCookie: '',
  ytDlExe: '',
};
const DEFAULT_LX = {
  enabled: false,
  source: 'kw',
  scriptUrl: '',
  timeoutMs: 15000,
  cacheMs: 600000,
  sources: [],
};

function defaultConfig() {
  return {
    audio: {
      proxyStream: true,
      defaultQuality: 'standard',
      cacheTtl: 1800,
      cacheDir: '',
      providerOrder: [...DEFAULT_PROVIDER_ORDER],
      fallbackToLegacy: true,
      unblock: { ...DEFAULT_UNBLOCK },
      lx: { ...DEFAULT_LX },
    },
  };
}

function normalizeLxSources(lx) {
  const sources = Array.isArray(lx.sources) ? lx.sources : [];
  if (sources.length > 0) return sources;
  if (!lx.scriptUrl) return [];
  return [
    {
      enabled: true,
      name: lx.source || 'kw',
      source: lx.source || 'kw',
      scriptUrl: lx.scriptUrl,
    },
  ];
}

function normalizeConfig(value) {
  const defaults = defaultConfig();
  const config = value || {};
  const audio = config.audio || {};
  const lx = audio.lx || {};

  return {
    ...defaults,
    ...config,
    audio: {
      ...defaults.audio,
      ...audio,
      providerOrder: Array.isArray(audio.providerOrder)
        ? [...audio.providerOrder]
        : [...DEFAULT_PROVIDER_ORDER],
      unblock: {
        ...DEFAULT_UNBLOCK,
        ...(audio.unblock || {}),
      },
      lx: {
        ...DEFAULT_LX,
        ...lx,
        sources: normalizeLxSources(lx).map((source, index) => ({
          enabled: source?.enabled !== false,
          name: source?.name || `LX Source ${index + 1}`,
          source: source?.source || lx.source || 'kw',
          scriptUrl: source?.scriptUrl || '',
        })),
      },
    },
  };
}

function parseProviderOrder(value) {
  const providers = String(value || '')
    .split(',')
    .map(provider => provider.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(providers));
}

export default {
  name: 'ResolverConfiguration',
  emits: ['saved'],
  data() {
    return {
      config: defaultConfig(),
      providerOrderText: DEFAULT_PROVIDER_ORDER.join(', '),
      loading: true,
      saving: false,
      loadError: '',
    };
  },
  mounted() {
    this.loadConfig();
  },
  methods: {
    ...mapActions(['showToast']),
    async loadConfig() {
      this.loading = true;
      this.loadError = '';
      try {
        const data = await getResolverConfig();
        this.config = normalizeConfig(data?.config);
        this.providerOrderText = this.config.audio.providerOrder.join(', ');
      } catch (error) {
        this.loadError = `无法读取内置 Resolver 配置：${
          error?.message || String(error)
        }`;
      } finally {
        this.loading = false;
      }
    },
    async saveConfig() {
      const providerOrder = parseProviderOrder(this.providerOrderText);
      if (providerOrder.length === 0) {
        this.showToast('Provider 顺序不能为空');
        return;
      }

      this.saving = true;
      try {
        const nextConfig = normalizeConfig(this.config);
        nextConfig.audio.providerOrder = providerOrder;
        nextConfig.audio.cacheTtl = Math.max(
          1,
          Number(nextConfig.audio.cacheTtl) || 1800
        );
        nextConfig.audio.lx.timeoutMs = Math.max(
          1000,
          Number(nextConfig.audio.lx.timeoutMs) || 15000
        );
        nextConfig.audio.lx.cacheMs = Math.max(
          0,
          Number(nextConfig.audio.lx.cacheMs) || 0
        );

        const data = await updateResolverConfig(nextConfig);
        this.config = normalizeConfig(data?.config || nextConfig);
        this.providerOrderText = this.config.audio.providerOrder.join(', ');
        this.showToast('音频解析配置已保存');
        this.$emit('saved');
      } catch (error) {
        this.showToast(`保存解析配置失败：${error?.message || error}`);
      } finally {
        this.saving = false;
      }
    },
    addLxSource() {
      this.config.audio.lx.sources.push({
        enabled: true,
        name: `LX Source ${this.config.audio.lx.sources.length + 1}`,
        source: this.config.audio.lx.source || 'kw',
        scriptUrl: '',
      });
    },
    removeLxSource(index) {
      this.config.audio.lx.sources.splice(index, 1);
    },
    moveLxSource(index, direction) {
      const target = index + direction;
      if (target < 0 || target >= this.config.audio.lx.sources.length) return;
      const [source] = this.config.audio.lx.sources.splice(index, 1);
      this.config.audio.lx.sources.splice(target, 0, source);
    },
  },
};
</script>

<style lang="scss" scoped>
.resolver-configuration {
  margin-top: 36px;
  color: var(--color-text);
}

h3 {
  margin-bottom: 8px;
}

h4 {
  margin: 32px 0 12px;
  font-size: 18px;
}

.section-description,
.field small {
  opacity: 0.68;
}

.config-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 20px 0;
  padding: 16px;
  border-radius: 10px;
  background: var(--color-secondary-bg);
}

.error-message {
  color: #e04f5f;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;

  input,
  select {
    box-sizing: border-box;
    width: 100%;
  }
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;

  input {
    width: auto;
  }
}

.full-width-field {
  margin-top: 14px;
}

.source-list {
  margin-top: 16px;
}

.source-card {
  margin-top: 12px;
  padding: 16px;
  border-radius: 10px;
  background: var(--color-secondary-bg);
}

.source-card-header,
.source-enabled,
.source-actions,
.config-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.source-card-header {
  justify-content: space-between;
  margin-bottom: 12px;
}

.source-actions,
.config-actions {
  flex-wrap: wrap;
  margin-top: 14px;
}

.add-source {
  margin-top: 14px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  transform: none !important;
}

@media (max-width: 720px) {
  .config-grid {
    grid-template-columns: 1fr;
  }
}
</style>

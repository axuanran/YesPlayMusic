<template>
  <section class="resolver-configuration">
    <h3>解析配置</h3>
    <div class="description section-description">
      桌面端与 Docker 使用应用自带的完整 Resolver。配置保存后会直接影响
      Netease、Unblock、LX 和 fallback Provider，无需填写 Resolver 地址。
    </div>

    <div v-if="loading" class="config-message">正在读取解析配置…</div>
    <div v-else-if="loadError" class="config-message error">
      <div>{{ loadError }}</div>
      <button @click="loadConfig">重试</button>
    </div>

    <template v-else>
      <h4>基础设置</h4>
      <div class="item">
        <div class="left">
          <div class="title">代理播放流</div>
          <div class="description">
            通过内置 Resolver 转发播放流，可在源地址失效时自动尝试下一个 Provider。
          </div>
        </div>
        <div class="right toggle">
          <input
            id="resolver-proxy-stream"
            v-model="config.audio.proxyStream"
            type="checkbox"
          />
          <label for="resolver-proxy-stream"></label>
        </div>
      </div>

      <div class="item">
        <div class="left">
          <div class="title">默认解析音质</div>
          <div class="description">播放器未指定音质时使用的默认等级。</div>
        </div>
        <div class="right">
          <select v-model="config.audio.defaultQuality">
            <option value="standard">标准</option>
            <option value="exhigh">极高</option>
            <option value="lossless">无损</option>
            <option value="hires">Hi-Res</option>
            <option value="jyeffect">高清环绕声</option>
            <option value="sky">沉浸环绕声</option>
            <option value="jymaster">超清母带</option>
          </select>
        </div>
      </div>

      <div class="item">
        <div class="left">
          <div class="title">解析缓存时间</div>
          <div class="description">Resolver 播放地址缓存的有效时间，单位为秒。</div>
        </div>
        <div class="right">
          <input
            v-model.number="config.audio.cacheTtl"
            class="number-input"
            type="number"
            min="0"
            step="60"
          />
        </div>
      </div>

      <div class="item vertical">
        <div class="left">
          <div class="title">Provider 顺序</div>
          <div class="description">
            按从左到右的顺序尝试。支持 netease、lx、unblock、fallback。
          </div>
        </div>
        <input
          v-model="providerOrderText"
          class="wide-input"
          placeholder="netease, lx, unblock, fallback"
        />
      </div>

      <h4>UnblockNeteaseMusic</h4>
      <div class="item">
        <div class="left">
          <div class="title">启用 Unblock Provider</div>
          <div class="description">
            使用应用内置的 @unblockneteasemusic/rust-napi 搜索替代音源。
          </div>
        </div>
        <div class="right toggle">
          <input
            id="resolver-unblock-enabled"
            v-model="config.audio.unblock.enabled"
            type="checkbox"
          />
          <label for="resolver-unblock-enabled"></label>
        </div>
      </div>

      <div class="item vertical">
        <div class="left">
          <div class="title">Unblock 音源</div>
          <div class="description">多个音源用英文逗号分隔。</div>
        </div>
        <input
          v-model="config.audio.unblock.source"
          class="wide-input"
          placeholder="ytdl, bilibili, pyncm, kugou"
        />
      </div>

      <div class="item">
        <div class="left">
          <div class="title">允许 FLAC</div>
        </div>
        <div class="right toggle">
          <input
            id="resolver-unblock-flac"
            v-model="config.audio.unblock.enableFlac"
            type="checkbox"
          />
          <label for="resolver-unblock-flac"></label>
        </div>
      </div>

      <div class="item">
        <div class="left">
          <div class="title">搜索模式</div>
        </div>
        <div class="right">
          <select v-model="config.audio.unblock.searchMode">
            <option value="fast-first">速度优先</option>
            <option value="order-first">音源顺序优先</option>
          </select>
        </div>
      </div>

      <div class="item vertical">
        <div class="left">
          <div class="title">Unblock 代理</div>
          <div class="description">留空表示不为 Unblock 单独设置代理。</div>
        </div>
        <input
          v-model="config.audio.unblock.proxyUri"
          class="wide-input"
          placeholder="http://127.0.0.1:7890"
        />
      </div>

      <div class="item vertical">
        <div class="left">
          <div class="title">JOOX Cookie</div>
        </div>
        <input
          v-model="config.audio.unblock.jooxCookie"
          class="wide-input"
          type="password"
          autocomplete="off"
          placeholder="wmid=...; session_key=..."
        />
      </div>

      <div class="item vertical">
        <div class="left">
          <div class="title">QQ Cookie</div>
        </div>
        <input
          v-model="config.audio.unblock.qqCookie"
          class="wide-input"
          type="password"
          autocomplete="off"
          placeholder="uin=...; qm_keyst=..."
        />
      </div>

      <div class="item vertical">
        <div class="left">
          <div class="title">yt-dlp 路径</div>
          <div class="description">需要 ytdl 音源时可指定 yt-dlp 可执行文件。</div>
        </div>
        <input
          v-model="config.audio.unblock.ytDlExe"
          class="wide-input"
          placeholder="yt-dlp"
        />
      </div>

      <h4>洛雪音源</h4>
      <div class="item">
        <div class="left">
          <div class="title">启用 LX Provider</div>
          <div class="description">按下方顺序尝试已启用的洛雪自定义音源。</div>
        </div>
        <div class="right toggle">
          <input
            id="resolver-lx-enabled"
            v-model="config.audio.lx.enabled"
            type="checkbox"
          />
          <label for="resolver-lx-enabled"></label>
        </div>
      </div>

      <div class="item lx-runtime-row">
        <label>
          <span>请求超时（ms）</span>
          <input
            v-model.number="config.audio.lx.timeoutMs"
            type="number"
            min="1000"
            step="1000"
          />
        </label>
        <label>
          <span>脚本缓存（ms）</span>
          <input
            v-model.number="config.audio.lx.cacheMs"
            type="number"
            min="0"
            step="60000"
          />
        </label>
      </div>

      <div
        v-for="(source, index) in config.audio.lx.sources"
        :key="`lx-${index}`"
        class="lx-source"
      >
        <div class="lx-source-header">
          <strong>{{ source.name || `LX Source ${index + 1}` }}</strong>
          <div class="toggle">
            <input
              :id="`resolver-lx-source-${index}`"
              v-model="source.enabled"
              type="checkbox"
            />
            <label :for="`resolver-lx-source-${index}`"></label>
          </div>
        </div>
        <div class="lx-source-grid">
          <label>
            <span>名称</span>
            <input v-model="source.name" placeholder="LX Source" />
          </label>
          <label>
            <span>Source ID</span>
            <input v-model="source.source" placeholder="kw" />
          </label>
        </div>
        <label class="lx-script-url">
          <span>脚本 URL / 本地路径</span>
          <input
            v-model="source.scriptUrl"
            class="wide-input"
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

const DEFAULT_UNBLOCK_CONFIG = {
  enabled: true,
  source: 'ytdl, bilibili, pyncm, kugou',
  enableFlac: false,
  proxyUri: '',
  searchMode: 'fast-first',
  jooxCookie: '',
  qqCookie: '',
  ytDlExe: '',
};

const DEFAULT_LX_CONFIG = {
  enabled: false,
  source: 'kw',
  scriptUrl: '',
  timeoutMs: 15000,
  cacheMs: 600000,
  sources: [],
};

function createDefaultConfig() {
  return {
    audio: {
      proxyStream: true,
      defaultQuality: 'standard',
      cacheTtl: 1800,
      cacheDir: '',
      providerOrder: ['netease', 'lx', 'unblock', 'fallback'],
      fallbackToLegacy: true,
      unblock: { ...DEFAULT_UNBLOCK_CONFIG },
      lx: { ...DEFAULT_LX_CONFIG },
    },
  };
}

function normalizeConfig(config) {
  const defaults = createDefaultConfig();
  const audio = config?.audio || {};
  const lx = audio.lx || {};
  const configuredSources = Array.isArray(lx.sources) ? lx.sources : [];
  const migratedSources =
    configuredSources.length === 0 && lx.scriptUrl
      ? [
          {
            enabled: true,
            name: lx.source || 'kw',
            source: lx.source || 'kw',
            scriptUrl: lx.scriptUrl,
          },
        ]
      : configuredSources;

  return {
    ...defaults,
    ...(config || {}),
    audio: {
      ...defaults.audio,
      ...audio,
      providerOrder: Array.isArray(audio.providerOrder)
        ? [...audio.providerOrder]
        : [...defaults.audio.providerOrder],
      unblock: {
        ...DEFAULT_UNBLOCK_CONFIG,
        ...(audio.unblock || {}),
      },
      lx: {
        ...DEFAULT_LX_CONFIG,
        ...lx,
        sources: migratedSources.map((source, index) => ({
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
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(providers));
}

export default {
  name: 'ResolverConfiguration',
  emits: ['saved'],
  data() {
    return {
      config: createDefaultConfig(),
      providerOrderText: 'netease, lx, unblock, fallback',
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
        this.config = normalizeConfig(data?.config || {});
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
          0,
          Number(nextConfig.audio.cacheTtl) || 0
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

  h3 {
    margin-bottom: 8px;
  }

  h4 {
    margin: 32px 0 8px;
    color: var(--color-text);
    font-size: 18px;
  }
}

.section-description {
  color: var(--color-text);
  line-height: 1.6;
}

.config-message {
  margin: 20px 0;
  padding: 16px;
  border-radius: 10px;
  color: var(--color-text);
  background: var(--color-secondary-bg);

  &.error {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }
}

.wide-input {
  box-sizing: border-box;
  width: 100%;
}

.number-input {
  width: 120px;
}

.lx-runtime-row {
  gap: 16px;

  label {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    color: var(--color-text);
  }
}

.lx-source {
  margin: 16px 0;
  padding: 16px;
  border-radius: 10px;
  color: var(--color-text);
  background: var(--color-secondary-bg);
}

.lx-source-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.lx-source-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  label {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}

.lx-script-url {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.source-actions,
.config-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.add-source {
  margin-top: 4px;
}

.config-actions {
  margin-top: 28px;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
  transform: none !important;
}

@media (max-width: 720px) {
  .lx-source-grid {
    grid-template-columns: 1fr;
  }

  .lx-runtime-row {
    flex-direction: column;
  }
}
</style>

<template>
  <section class="mobile-resolver-configuration">
    <h3>Android 解析配置</h3>
    <p class="section-description">
      这些设置控制手机端 UI/原生兼容的内置 Provider，保存后立即生效。
    </p>

    <div v-if="loading" class="config-message">正在读取解析配置…</div>
    <div v-else-if="loadError" class="config-message error-message">
      <span>{{ loadError }}</span>
      <button @click="loadConfig">重试</button>
    </div>

    <template v-else>
      <h4>播放源</h4>
      <div class="config-grid">
        <label class="field">
          <span>解析音质</span>
          <select v-model="musicQuality">
            <option value="standard">标准</option>
            <option value="exhigh">极高</option>
            <option value="lossless">无损</option>
            <option value="hires">Hi-Res</option>
            <option value="jyeffect">高清环绕声</option>
            <option value="sky">沉浸环绕声</option>
            <option value="jymaster">超清母带</option>
          </select>
          <small>与全局“音乐音质”共用同一设置。</small>
        </label>

        <label class="field checkbox-field">
          <span>
            <strong>网易云直链解析</strong>
            <small>通过 Android 内置网易云 API 获取可播放地址。</small>
          </span>
          <input v-model="config.audio.mobile.neteaseEnabled" type="checkbox" />
        </label>

        <label class="field checkbox-field">
          <span>
            <strong>未登录 Outer URL 兜底</strong>
            <small>直链不可用时尝试网易云公开 Outer URL。</small>
          </span>
          <input
            v-model="config.audio.mobile.outerUrlFallback"
            type="checkbox"
          />
        </label>

        <label class="field checkbox-field">
          <span>
            <strong>失败后回退旧播放链</strong>
            <small>内置 Provider 未得到地址时，再执行原有播放解析逻辑。</small>
          </span>
          <input v-model="config.audio.fallbackToLegacy" type="checkbox" />
        </label>
      </div>

      <h4>解析缓存</h4>
      <div class="config-grid">
        <label class="field checkbox-field">
          <span>
            <strong>启用解析缓存</strong>
            <small>缓存临时播放地址，减少重复解析请求。</small>
          </span>
          <input v-model="cacheEnabled" type="checkbox" />
        </label>

        <label class="field" :class="{ disabled: !cacheEnabled }">
          <span>缓存时间（秒）</span>
          <input
            v-model.number="config.audio.cacheTtl"
            type="number"
            min="1"
            step="30"
            :disabled="!cacheEnabled"
          />
          <small>设为关闭时不会写入新的解析缓存。</small>
        </label>
      </div>

      <div class="platform-note">
        Android 不运行 Node Resolver，因此
        LX、UnblockNeteaseMusic、流代理、缓存目录和 yt-dlp 属于 Electron /
        Docker 的完整 Resolver 配置，不会在手机端显示为无效开关。
      </div>

      <div class="config-actions">
        <button :disabled="saving" @click="saveConfig">
          {{ saving ? '保存中…' : '保存 Android 解析配置' }}
        </button>
        <button :disabled="saving" @click="loadConfig">重新读取</button>
        <button :disabled="saving" @click="resetConfig">恢复默认值</button>
      </div>
    </template>
  </section>
</template>

<script>
import { mapActions, mapState } from 'vuex';
import {
  getResolverConfig,
  normalizeEmbeddedResolverConfig,
  updateResolverConfig,
} from '@/api/audioResolver';

export default {
  name: 'MobileResolverConfiguration',
  emits: ['saved'],
  data() {
    return {
      config: normalizeEmbeddedResolverConfig({}),
      loading: true,
      saving: false,
      loadError: '',
      lastCacheTtl: 300,
    };
  },
  computed: {
    ...mapState(['settings']),
    musicQuality: {
      get() {
        return this.settings.musicQuality || 'exhigh';
      },
      set(value) {
        this.$store.commit('changeMusicQuality', value);
      },
    },
    cacheEnabled: {
      get() {
        return Number(this.config.audio.cacheTtl) > 0;
      },
      set(value) {
        if (value) {
          this.config.audio.cacheTtl = Math.max(1, this.lastCacheTtl || 300);
          return;
        }
        const current = Number(this.config.audio.cacheTtl);
        if (Number.isFinite(current) && current > 0)
          this.lastCacheTtl = current;
        this.config.audio.cacheTtl = 0;
      },
    },
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
        this.config = normalizeEmbeddedResolverConfig(data?.config);
        if (Number(this.config.audio.cacheTtl) > 0) {
          this.lastCacheTtl = Number(this.config.audio.cacheTtl);
        }
      } catch (error) {
        this.loadError = `无法读取 Android 解析配置：${
          error?.message || String(error)
        }`;
      } finally {
        this.loading = false;
      }
    },
    async saveConfig() {
      this.saving = true;
      try {
        const nextConfig = normalizeEmbeddedResolverConfig(this.config);
        if (this.cacheEnabled) {
          nextConfig.audio.cacheTtl = Math.max(
            1,
            Number(nextConfig.audio.cacheTtl) || this.lastCacheTtl || 300
          );
        } else {
          nextConfig.audio.cacheTtl = 0;
        }
        const data = await updateResolverConfig(nextConfig);
        this.config = normalizeEmbeddedResolverConfig(
          data?.config || nextConfig
        );
        if (Number(this.config.audio.cacheTtl) > 0) {
          this.lastCacheTtl = Number(this.config.audio.cacheTtl);
        }
        this.showToast('Android 音频解析配置已保存');
        this.$emit('saved');
      } catch (error) {
        this.showToast(`保存 Android 解析配置失败：${error?.message || error}`);
      } finally {
        this.saving = false;
      }
    },
    resetConfig() {
      this.config = normalizeEmbeddedResolverConfig({});
      this.lastCacheTtl = Number(this.config.audio.cacheTtl) || 300;
      this.showToast('已恢复默认值，保存后生效');
    },
  },
};
</script>

<style lang="scss" scoped>
.mobile-resolver-configuration {
  margin-top: 36px;
  color: var(--color-text);
}

h3 {
  margin-bottom: 8px;
}

h4 {
  margin: 28px 0 12px;
  font-size: 18px;
}

.section-description,
.field small,
.platform-note {
  opacity: 0.68;
}

.config-message,
.platform-note {
  margin: 20px 0;
  padding: 16px;
  border-radius: 10px;
  background: var(--color-secondary-bg);
}

.config-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  padding: 12px 0;

  input,
  select {
    box-sizing: border-box;
    width: 100%;
  }

  small {
    display: block;
    margin-top: 4px;
    font-weight: 400;
  }
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 16px;

  input {
    width: auto;
    flex: 0 0 auto;
  }
}

.disabled {
  opacity: 0.55;
}

.platform-note {
  line-height: 1.6;
}

.config-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
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

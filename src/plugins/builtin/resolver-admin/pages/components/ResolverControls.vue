<template>
  <div>
    <div class="item">
      <div class="left">
        <div class="title">启用音频解析</div>
        <div class="description">由音频解析服务接管播放地址解析。</div>
      </div>
      <div class="right">
        <div class="toggle">
          <input
            id="plugin-use-audio-resolver"
            :checked="useAudioResolver"
            type="checkbox"
            name="plugin-use-audio-resolver"
            @change="$emit('update:useAudioResolver', $event.target.checked)"
          />
          <label for="plugin-use-audio-resolver"></label>
        </div>
      </div>
    </div>

    <div class="item vertical">
      <div class="left">
        <div class="title">Resolver 地址</div>
        <div class="description"
          >无已保存地址时自动使用当前网页同源的 /resolver-api；Docker
          和桌面端均使用同源代理。</div
        >
      </div>
      <div class="resolver-actions">
        <input
          :value="audioResolverUrl"
          type="text"
          placeholder="/resolver-api"
          @input="$emit('update:audioResolverUrl', $event.target.value)"
        />
        <button @click="syncToCurrentPageUrl">同步当前网页地址</button>
        <button @click="$emit('open-admin')">打开管理面板</button>
        <button @click="$emit('sync-cookie')">从前端获取 Cookie</button>
        <button @click="$emit('clear-cache')">清后端缓存</button>
      </div>
    </div>
  </div>
</template>

<script>
import { getCurrentPageResolverURL } from '@/api/audioResolver';

export default {
  name: 'ResolverControls',
  props: {
    useAudioResolver: {
      type: Boolean,
      required: true,
    },
    audioResolverUrl: {
      type: String,
      required: true,
    },
  },
  emits: [
    'update:useAudioResolver',
    'update:audioResolverUrl',
    'open-admin',
    'sync-cookie',
    'clear-cache',
  ],
  methods: {
    syncToCurrentPageUrl() {
      this.$emit('update:audioResolverUrl', getCurrentPageResolverURL());
    },
  },
};
</script>

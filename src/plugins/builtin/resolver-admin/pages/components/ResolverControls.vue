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
          >默认地址为 /resolver-api；Docker
          或网页部署建议使用同源代理。默认本地服务启动地址为：http://127.0.0.1:27232</div
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
      const currentOrigin = window.location.origin;
      const nextValue =
        currentOrigin && currentOrigin !== 'null'
          ? new URL('/resolver-api', currentOrigin).toString()
          : '/resolver-api';
      this.$emit('update:audioResolverUrl', nextValue);
    },
  },
};
</script>

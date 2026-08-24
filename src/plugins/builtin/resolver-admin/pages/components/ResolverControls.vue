<template>
  <div>
    <div class="item">
      <div class="left">
        <div class="title">启用音频解析</div>
        <div class="description">
          <template v-if="isCapacitor">
            Android 使用 UI/原生兼容的内置 Provider 解析播放地址。
          </template>
          <template v-else>
            使用应用随附的完整 Resolver；无需配置地址或单独启动解析服务。
          </template>
        </div>
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
        <div class="title">解析缓存</div>
        <div class="description">
          <template v-if="isCapacitor">
            清理 UI Provider 已缓存的临时播放地址。
          </template>
          <template v-else>
            同时清理 UI Provider 和应用内置 Resolver 的播放地址缓存。
          </template>
        </div>
      </div>
      <button @click="$emit('clear-cache')">清理解析缓存</button>
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
    isCapacitor: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:useAudioResolver', 'clear-cache'],
};
</script>

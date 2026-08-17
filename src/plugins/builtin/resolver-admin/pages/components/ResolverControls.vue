<template>
  <div>
    <div class="item">
      <div class="left">
        <div class="title">启用音频解析</div>
        <div class="description"
          >由应用内置 Provider 直接解析播放地址，不需要部署独立服务。</div
        >
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
        <div class="title">本地缓存</div>
        <div class="description">清理 UI Provider 已缓存的临时播放地址。</div>
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
  },
  emits: ['update:useAudioResolver', 'clear-cache'],
};
</script>

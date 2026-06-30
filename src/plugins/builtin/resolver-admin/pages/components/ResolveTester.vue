<template>
  <div class="item vertical">
    <div class="left">
      <div class="title">测试解析</div>
      <div class="description">输入 trackId 验证当前 provider 链路。</div>
    </div>
    <div class="resolver-actions">
      <input
        :value="trackId"
        type="text"
        placeholder="trackId"
        @input="$emit('update:trackId', $event.target.value)"
      />
      <select
        :value="quality"
        @change="$emit('update:quality', $event.target.value)"
      >
        <option value="standard">standard</option>
        <option value="exhigh">exhigh</option>
        <option value="lossless">lossless</option>
        <option value="hires">hires</option>
      </select>
      <button @click="$emit('test')">测试</button>
    </div>
    <div v-if="result" class="test-result">{{ result }}</div>
  </div>
</template>

<script>
export default {
  name: 'ResolveTester',
  props: {
    trackId: {
      type: String,
      required: true,
    },
    quality: {
      type: String,
      required: true,
    },
    result: {
      type: String,
      default: '',
    },
  },
  emits: ['update:trackId', 'update:quality', 'test'],
};
</script>

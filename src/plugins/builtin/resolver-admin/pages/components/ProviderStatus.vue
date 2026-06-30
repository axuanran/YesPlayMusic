<template>
  <div class="item vertical">
    <div class="left">
      <div class="title">Provider 状态</div>
      <div class="description">当前音频 Provider 按优先级执行。</div>
    </div>
    <div class="provider-list">
      <div
        v-for="provider in providers"
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
</template>

<script>
export default {
  name: 'ProviderStatus',
  props: {
    providers: {
      type: Array,
      required: true,
    },
  },
};
</script>

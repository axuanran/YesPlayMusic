<template>
  <button
    type="button"
    class="button-icon"
    :aria-label="$attrs['aria-label'] || $attrs.title"
  >
    <slot></slot>
  </button>
</template>

<script>
export default {
  name: 'ButtonIcon',
};
</script>

<style lang="scss" scoped>
button {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  background: transparent;
  margin: 4px;
  border-radius: 25%;
  transition: 0.2s;
  :slotted(.svg-icon) {
    color: var(--color-text);
    height: 16px;
    width: 16px;
  }
  &:first-child {
    margin-left: 0;
  }
  &:hover {
    background: var(--color-secondary-bg-for-transparent);
  }
  &:active {
    transform: scale(0.92);
  }
  &:disabled {
    cursor: default;
    opacity: 0.38;
    pointer-events: none;
  }
}
</style>

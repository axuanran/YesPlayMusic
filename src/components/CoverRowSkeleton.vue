<template>
  <div class="cover-row-skeleton" :style="rowStyles" aria-hidden="true">
    <div v-for="index in count" :key="index" class="skeleton-item">
      <div class="skeleton-cover" :class="{ circle }"></div>
      <div class="skeleton-line skeleton-line-title"></div>
      <div class="skeleton-line skeleton-line-subtitle"></div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CoverRowSkeleton',
  props: {
    circle: { type: Boolean, default: false },
    columns: { type: Number, default: 5 },
    count: { type: Number, default: 5 },
    gap: { type: String, default: '44px 24px' },
  },
  computed: {
    rowStyles() {
      return {
        gap: this.gap,
        gridTemplateColumns: `repeat(${this.columns}, minmax(0, 1fr))`,
      };
    },
  },
};
</script>

<style lang="scss" scoped>
.cover-row-skeleton {
  display: grid;
}

.skeleton-item {
  min-width: 0;
}

.skeleton-cover,
.skeleton-line {
  position: relative;
  overflow: hidden;
  background: var(--color-secondary-bg);

  &::after {
    position: absolute;
    inset: 0;
    content: '';
    transform: translateX(-100%);
    animation: skeleton-shimmer 1.4s ease-in-out infinite;
    background: linear-gradient(
      100deg,
      transparent 20%,
      var(--color-secondary-bg-for-transparent) 50%,
      transparent 80%
    );
  }
}

.skeleton-cover {
  width: 100%;
  border-radius: 0.75em;
  aspect-ratio: 1;

  &.circle {
    border-radius: 50%;
  }
}

.skeleton-line {
  height: 12px;
  border-radius: 999px;
}

.skeleton-line-title {
  width: 78%;
  margin-top: 12px;
}

.skeleton-line-subtitle {
  width: 52%;
  height: 9px;
  margin-top: 8px;
  opacity: 0.72;
}

@keyframes skeleton-shimmer {
  to {
    transform: translateX(100%);
  }
}

@media (max-width: 834px) {
  .cover-row-skeleton {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 24px 12px !important;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-cover::after,
  .skeleton-line::after {
    animation: none;
  }
}
</style>

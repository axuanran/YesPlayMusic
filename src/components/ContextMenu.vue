<template>
  <div class="context-menu">
    <teleport to="body">
      <div
        v-if="showMenu"
        class="context-menu-layer"
        @contextmenu.prevent.self="closeMenu"
        @pointerdown.self="closeMenu"
      >
        <div
          ref="menu"
          class="menu"
          tabindex="-1"
          :style="menuStyle"
          @click="handleMenuClick"
          @contextmenu.prevent
          @keydown.esc.stop.prevent="closeMenu"
        >
          <slot></slot>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script>
import { getContextMenuLayout } from '@/utils/contextMenuPosition';

export default {
  name: 'ContextMenu',
  data() {
    return {
      anchorX: 0,
      anchorY: 0,
      showMenu: false,
      top: '0px',
      left: '0px',
      maxHeight: 'none',
      maxWidth: '240px',
      resizeObserver: null,
      repositionFrame: null,
    };
  },
  computed: {
    menuStyle() {
      return {
        top: this.top,
        left: this.left,
        maxHeight: this.maxHeight,
        maxWidth: this.maxWidth,
      };
    },
  },
  beforeUnmount() {
    this.stopPositionTracking();
  },
  methods: {
    getVisibleBoundary() {
      const visualViewport = window.visualViewport;
      const viewportLeft = visualViewport?.offsetLeft || 0;
      const viewportTop = visualViewport?.offsetTop || 0;
      const viewportWidth = visualViewport?.width || window.innerWidth;
      const viewportHeight = visualViewport?.height || window.innerHeight;
      const viewportBottom = viewportTop + viewportHeight;
      const navbar = document.querySelector('nav');
      const player = document.querySelector('.player');
      const navbarRect = navbar?.getClientRects().length
        ? navbar.getBoundingClientRect()
        : null;
      const playerRect = player?.getClientRects().length
        ? player.getBoundingClientRect()
        : null;

      return {
        bottomInset:
          playerRect && playerRect.top < viewportBottom
            ? viewportBottom - playerRect.top
            : 0,
        topInset:
          navbarRect && navbarRect.bottom > viewportTop
            ? navbarRect.bottom - viewportTop
            : 0,
        viewportHeight,
        viewportLeft,
        viewportTop,
        viewportWidth,
      };
    },

    setMenu() {
      const menu = this.$refs.menu;
      if (!menu) return;
      const boundary = this.getVisibleBoundary();
      const layout = getContextMenuLayout({
        ...boundary,
        menuHeight: menu.scrollHeight,
        menuWidth: menu.scrollWidth,
        x: this.anchorX,
        y: this.anchorY,
      });
      this.top = `${layout.top}px`;
      this.left = `${layout.left}px`;
      this.maxHeight = `${layout.maxHeight}px`;
      this.maxWidth = `${Math.min(layout.maxWidth, 240)}px`;
    },

    schedulePositionUpdate() {
      if (this.repositionFrame !== null) return;
      this.repositionFrame = requestAnimationFrame(() => {
        this.repositionFrame = null;
        this.setMenu();
      });
    },

    startPositionTracking() {
      this.stopPositionTracking();
      if (typeof ResizeObserver === 'function') {
        this.resizeObserver = new ResizeObserver(this.schedulePositionUpdate);
        this.resizeObserver.observe(this.$refs.menu);
      }
      window.addEventListener('resize', this.schedulePositionUpdate);
      window.addEventListener('blur', this.closeMenu);
      window.visualViewport?.addEventListener(
        'resize',
        this.schedulePositionUpdate
      );
      window.visualViewport?.addEventListener(
        'scroll',
        this.schedulePositionUpdate
      );
    },

    stopPositionTracking() {
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      window.removeEventListener('resize', this.schedulePositionUpdate);
      window.removeEventListener('blur', this.closeMenu);
      window.visualViewport?.removeEventListener(
        'resize',
        this.schedulePositionUpdate
      );
      window.visualViewport?.removeEventListener(
        'scroll',
        this.schedulePositionUpdate
      );
      if (this.repositionFrame !== null) {
        cancelAnimationFrame(this.repositionFrame);
        this.repositionFrame = null;
      }
    },

    closeMenu() {
      if (!this.showMenu) return;
      this.showMenu = false;
      this.stopPositionTracking();
      if (this.$parent.closeMenu !== undefined) {
        this.$parent.closeMenu();
      }
    },

    handleMenuClick(event) {
      if (event.target?.closest?.('.item')) this.closeMenu();
    },

    openMenu(e) {
      e.preventDefault();
      this.anchorX = e.clientX ?? e.x;
      this.anchorY = e.clientY ?? e.y;
      this.showMenu = true;
      this.$nextTick(() => {
        this.setMenu();
        this.startPositionTracking();
        this.$refs.menu?.focus({ preventScroll: true });
      });
    },
  },
};
</script>

<style lang="scss" scoped>
.context-menu {
  display: contents;
  user-select: none;
}

.context-menu-layer {
  position: fixed;
  inset: 0;
  z-index: 10000;
  -webkit-app-region: no-drag;
}

.menu {
  position: fixed;
  min-width: 136px;
  max-width: 240px;
  list-style: none;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 6px 12px -4px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  box-sizing: border-box;
  padding: 6px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  z-index: 1;
  -webkit-app-region: no-drag;
  transition:
    background 125ms ease-out,
    opacity 125ms ease-out,
    transform 125ms ease-out;

  &:focus {
    outline: none;
  }
}

[data-theme='dark'] {
  .menu {
    background: rgba(36, 36, 36, 0.78);
    backdrop-filter: blur(16px) contrast(120%) brightness(60%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.08);
  }
  .menu .item:hover {
    color: var(--color-text);
  }
}

@supports (-moz-appearance: none) {
  .menu {
    background-color: var(--color-body-bg) !important;
  }
}

.menu .item {
  font-weight: 600;
  font-size: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  cursor: default;
  color: var(--color-text);
  display: flex;
  align-items: center;
  &:hover {
    color: var(--color-primary);
    background: var(--color-primary-bg-for-transparent);
    transition:
      opacity 125ms ease-out,
      transform 125ms ease-out;
  }
  &:active {
    opacity: 0.75;
    transform: scale(0.95);
  }

  :deep(.svg-icon) {
    height: 16px;
    width: 16px;
    margin-right: 5px;
  }
}

hr {
  margin: 4px 10px;
  background: rgba(128, 128, 128, 0.18);
  height: 1px;
  box-shadow: none;
  border: none;
}

.item-info {
  padding: 10px 10px;
  display: flex;
  align-items: center;
  color: var(--color-text);
  cursor: default;
  img {
    height: 38px;
    width: 38px;
    border-radius: 4px;
  }
  .info {
    margin-left: 10px;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
  .subtitle {
    font-size: 12px;
    opacity: 0.68;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    overflow: hidden;
    word-break: break-all;
  }
}
</style>

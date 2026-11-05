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
          role="menu"
          :aria-label="label || $t('contextMenu.label')"
          tabindex="-1"
          :style="menuStyle"
          @click="handleMenuClick"
          @contextmenu.prevent
          @keydown="handleMenuKeydown"
        >
          <slot></slot>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script>
import { getContextMenuLayout } from '@/utils/contextMenuPosition';
import { getContextMenuTargetIndex } from '@/utils/contextMenuKeyboard';

export default {
  name: 'ContextMenu',
  props: {
    label: { type: String, default: '' },
  },
  data() {
    return {
      anchorX: 0,
      anchorY: 0,
      showMenu: false,
      top: '0px',
      left: '0px',
      maxHeight: 'none',
      maxWidth: '240px',
      positioned: false,
      resizeObserver: null,
      repositionFrame: null,
      triggerElement: null,
    };
  },
  computed: {
    menuStyle() {
      return {
        top: this.top,
        left: this.left,
        maxHeight: this.maxHeight,
        maxWidth: this.maxWidth,
        visibility: this.positioned ? 'visible' : 'hidden',
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
      const getVisibleRect = selector => {
        const element = document.querySelector(selector);
        return element?.getClientRects().length
          ? element.getBoundingClientRect()
          : null;
      };
      const navbarRect = getVisibleRect('nav:not(.mobile-tabbar)');
      const mobileTopbarRect = getVisibleRect('.mobile-topbar');
      const mobileTabbarRect = getVisibleRect('.mobile-tabbar');
      const playerRect = getVisibleRect('.player');
      const topRect = mobileTopbarRect || navbarRect;
      const bottomInsets = [playerRect, mobileTabbarRect]
        .filter(rect => rect && rect.top < viewportBottom)
        .map(rect => viewportBottom - rect.top);

      return {
        bottomInset: bottomInsets.length > 0 ? Math.max(...bottomInsets) : 0,
        topInset:
          topRect && topRect.bottom > viewportTop
            ? topRect.bottom - viewportTop
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
      this.positioned = true;
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

    closeMenu(eventOrRestore = true) {
      if (!this.showMenu) return;
      const restoreFocus =
        eventOrRestore !== false && eventOrRestore?.type !== 'blur';
      this.showMenu = false;
      this.stopPositionTracking();
      if (this.$parent.closeMenu !== undefined) {
        this.$parent.closeMenu();
      }
      if (restoreFocus && this.triggerElement?.isConnected) {
        this.$nextTick(() => {
          this.triggerElement?.focus?.({ preventScroll: true });
        });
      }
    },

    getMenuItems() {
      const menu = this.$refs.menu;
      if (!menu) return [];
      return [...menu.querySelectorAll('.item')].filter(
        item =>
          !item.matches('[disabled], [aria-disabled="true"]') &&
          item.getClientRects().length > 0
      );
    },

    prepareMenuItems() {
      const items = this.getMenuItems();
      for (const item of items) {
        if (!item.hasAttribute('role')) item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '-1');
      }
      return items;
    },

    handleMenuClick(event) {
      if (event.target?.closest?.('.item')) this.closeMenu();
    },

    handleMenuKeydown(event) {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        this.closeMenu();
        return;
      }
      const items = this.getMenuItems();
      const currentIndex = items.indexOf(document.activeElement);
      const targetIndex = getContextMenuTargetIndex(
        event.key,
        currentIndex,
        items.length
      );
      if (targetIndex !== null) {
        event.preventDefault();
        event.stopPropagation();
        items[targetIndex]?.focus({ preventScroll: true });
        return;
      }
      if ((event.key === 'Enter' || event.key === ' ') && currentIndex >= 0) {
        event.preventDefault();
        event.stopPropagation();
        items[currentIndex].click();
      }
    },

    openMenu(e) {
      e.preventDefault();
      this.triggerElement =
        e.currentTarget instanceof HTMLElement ? e.currentTarget : e.target;
      const targetRect = this.triggerElement?.getBoundingClientRect?.();
      const keyboardAnchor =
        (e.clientX ?? e.x) === 0 && (e.clientY ?? e.y) === 0;
      this.anchorX = keyboardAnchor
        ? targetRect?.left || 0
        : (e.clientX ?? e.x);
      this.anchorY = keyboardAnchor
        ? targetRect?.bottom || 0
        : (e.clientY ?? e.y);
      this.top = `${this.anchorY}px`;
      this.left = `${this.anchorX}px`;
      this.maxHeight = 'none';
      this.maxWidth = '240px';
      this.positioned = false;
      this.showMenu = true;
      this.$nextTick(() => {
        this.repositionFrame = requestAnimationFrame(() => {
          this.repositionFrame = null;
          if (!this.showMenu) return;
          this.setMenu();
          const items = this.prepareMenuItems();
          (items[0] || this.$refs.menu)?.focus({ preventScroll: true });
          this.startPositionTracking();
        });
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
}

@supports (-moz-appearance: none) {
  .menu {
    background-color: var(--color-body-bg) !important;
  }
}
</style>

<!--
  菜单内容（.item / hr / .item-info …）都是使用方通过默认插槽传进来的，
  而 scoped 样式只会命中组件自己模板里的元素：插槽内容带的是父组件的
  data-v 属性（这里是 xxx-s），拿不到 .menu 所在的 data-v，所以把这些
  规则写在 scoped 块里时一条都不会生效（菜单项没有内边距、悬停无高亮、
  鼠标停在文字上还是文本输入的 I 形）。因此这里放一个非 scoped 的块，
  并用 .context-menu-layer 限定作用范围。
-->
<style lang="scss">
.context-menu-layer {
  .menu {
    user-select: none;
  }

  .menu hr {
    margin: 4px 10px;
    background: rgba(128, 128, 128, 0.18);
    height: 1px;
    box-shadow: none;
    border: none;
  }

  .menu .item {
    font-weight: 600;
    font-size: 14px;
    padding: 10px 14px;
    border-radius: 8px;
    // 菜单项全部是「点击后执行动作」的条目，必须显示手型光标；
    // 用默认光标时落在文字上是文本输入的 I 形，用户会误以为这里不可点。
    cursor: pointer;
    color: var(--color-text);
    display: flex;
    align-items: center;

    .svg-icon {
      height: 16px;
      width: 16px;
      margin-right: 5px;
    }

    &:hover,
    &:focus-visible {
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

  @media (pointer: coarse) {
    .menu .item {
      min-height: 44px;
      box-sizing: border-box;
    }
  }
}

// 深色主题下主色悬停文字的对比度偏低，保持菜单项文字颜色不变。
[data-theme='dark'] .context-menu-layer .menu .item:hover {
  color: var(--color-text);
}
</style>

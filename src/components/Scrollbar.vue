<template>
  <div>
    <transition name="fade">
      <div
        v-show="show"
        id="scrollbar"
        :class="{ 'on-drag': isOnDrag }"
        @click="handleClick"
      >
        <div
          id="thumbContainer"
          ref="thumbContainer"
          :class="{ active }"
          @mouseenter="handleMouseenter"
          @mouseleave="handleMouseleave"
          @mousedown="handleDragStart"
          @click.stop
        >
          <div></div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
const SCROLLBAR_SYNC_INTERVAL = 100;
const POSITION_SAVE_INTERVAL = 500;

export default {
  name: 'Scrollbar',
  data() {
    return {
      active: false,
      show: false,
      hideTimer: null,
      scrollSyncTimer: null,
      positionSaveTimer: null,
      pendingRoutePosition: null,
      isOnDrag: false,
      onDragClientY: 0,
      positions: {
        home: { scrollTop: 0, params: {} },
      },
    };
  },
  computed: {
    main() {
      return this.$parent.$refs.main;
    },
  },

  created() {
    this._thumbTop = 0;
    this.$router.beforeEach((to, from, next) => {
      this.show = false;
      next();
    });
  },

  beforeUnmount() {
    this.clearTimers();
    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
  },

  methods: {
    handleScroll() {
      if (this.scrollSyncTimer !== null) return;
      this.scrollSyncTimer = setTimeout(() => {
        this.scrollSyncTimer = null;
        this.syncScrollState();
      }, SCROLLBAR_SYNC_INTERVAL);
    },
    syncScrollState() {
      const main = this.main;
      const thumb = this.$refs.thumbContainer;
      if (!main || !thumb) return;

      const clintHeight = main.clientHeight - 128;
      const scrollHeight = main.scrollHeight - 128;
      const scrollTop = main.scrollTop;

      if (
        clintHeight <= 0 ||
        scrollHeight <= 0 ||
        scrollHeight <= clintHeight
      ) {
        if (this.show) this.show = false;
        return;
      }

      let top = ~~((scrollTop / scrollHeight) * clintHeight);
      let thumbHeight = ~~((clintHeight / scrollHeight) * clintHeight);

      if (thumbHeight < 24) thumbHeight = 24;
      if (top > clintHeight - thumbHeight) {
        top = clintHeight - thumbHeight;
      }

      this._thumbTop = top;
      thumb.style.transform = `translateY(${top}px)`;
      thumb.style.height = `${thumbHeight}px`;

      if (!this.show) this.show = true;

      this.setScrollbarHideTimeout();
      this.scheduleRoutePositionSave(scrollTop);
    },
    scheduleRoutePositionSave(scrollTop) {
      const route = this.$route;
      if (!route.meta.savePosition) return;

      this.pendingRoutePosition = {
        name: route.name,
        scrollTop,
        params: route.params,
      };

      if (this.positionSaveTimer !== null) return;
      this.positionSaveTimer = setTimeout(() => {
        this.positionSaveTimer = null;
        const position = this.pendingRoutePosition;
        this.pendingRoutePosition = null;
        if (!position) return;
        this.positions[position.name] = {
          scrollTop: position.scrollTop,
          params: position.params,
        };
      }, POSITION_SAVE_INTERVAL);
    },
    handleMouseenter() {
      this.active = true;
    },
    handleMouseleave() {
      this.active = false;
      this.setScrollbarHideTimeout();
    },
    handleDragStart(e) {
      this.onDragClientY = e.clientY;
      this.isOnDrag = true;
      this.$parent.userSelectNone = true;
      document.addEventListener('mousemove', this.handleDragMove);
      document.addEventListener('mouseup', this.handleDragEnd);
    },
    handleDragMove(e) {
      const main = this.main;
      const thumb = this.$refs.thumbContainer;
      if (!this.isOnDrag || !main || !thumb) return;

      const clintHeight = main.clientHeight - 128;
      const scrollHeight = main.scrollHeight - 128;
      if (clintHeight <= 0 || scrollHeight <= 0) return;

      const clientY = e.clientY;
      const scrollTop = main.scrollTop;
      const offset = ~~(
        ((clientY - this.onDragClientY) / clintHeight) *
        scrollHeight
      );
      const top = ~~((scrollTop / scrollHeight) * clintHeight);

      this._thumbTop = top;
      thumb.style.transform = `translateY(${top}px)`;
      main.scrollBy(0, offset);
      this.onDragClientY = clientY;
    },
    handleDragEnd() {
      this.isOnDrag = false;
      this.$parent.userSelectNone = false;
      document.removeEventListener('mousemove', this.handleDragMove);
      document.removeEventListener('mouseup', this.handleDragEnd);
      this.syncScrollState();
    },
    handleClick(e) {
      if (!this.main) return;
      const scrollTop = e.clientY < this._thumbTop + 84 ? -256 : 256;
      this.main.scrollBy({
        top: scrollTop,
        behavior: 'smooth',
      });
    },
    setScrollbarHideTimeout() {
      if (this.hideTimer !== null) clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        if (!this.active) this.show = false;
        this.hideTimer = null;
      }, 4000);
    },
    clearTimers() {
      if (this.hideTimer !== null) clearTimeout(this.hideTimer);
      if (this.scrollSyncTimer !== null) clearTimeout(this.scrollSyncTimer);
      if (this.positionSaveTimer !== null) clearTimeout(this.positionSaveTimer);
      this.hideTimer = null;
      this.scrollSyncTimer = null;
      this.positionSaveTimer = null;
    },
    restorePosition() {
      const route = this.$route;
      if (
        !route.meta.savePosition ||
        this.positions[route.name] === undefined ||
        this.main === undefined
      ) {
        return;
      }
      this.main.scrollTo({ top: this.positions[route.name].scrollTop });
      this.syncScrollState();
    },
  },
};
</script>

<style lang="scss" scoped>
#scrollbar {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 16px;
  z-index: 1000;

  #thumbContainer {
    margin-top: 64px;
    transform: translateY(0);
    height: 24px;
    will-change: transform;
    div {
      transition: background 0.4s;
      position: absolute;
      right: 2px;
      width: 8px;
      height: 100%;
      border-radius: 4px;
      background: rgba(128, 128, 128, 0.38);
    }
  }
  #thumbContainer.active div {
    background: rgba(128, 128, 128, 0.58);
  }
}

[data-theme='dark'] {
  #thumbContainer div {
    background: var(--color-secondary-bg);
  }
}

#scrollbar.on-drag {
  left: 0;
  width: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter,
.fade-leave-to {
  opacity: 0;
}
</style>

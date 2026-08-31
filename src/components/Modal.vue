<template>
  <div v-show="show" class="shade" role="presentation" @click="clickOutside">
    <div
      :id="dialogId"
      ref="dialog"
      class="modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :style="modalStyles"
      tabindex="-1"
      @click.stop
    >
      <div class="header">
        <div :id="titleId" class="title">{{ title }}</div>
        <button
          class="close"
          :aria-label="$t('modal.close')"
          :title="$t('modal.close')"
          @click="close"
          ><svg-icon icon-class="x"
        /></button>
      </div>
      <div class="content"><slot></slot></div>
      <div v-if="showFooter" class="footer">
        <!-- <button>取消</button>
        <button class="primary">确定</button> -->
        <slot name="footer"></slot>
      </div>
    </div>
  </div>
</template>

<script>
import { trapModalTab } from '@/utils/modalFocus';

let modalId = 0;
let openModalCount = 0;

export default {
  name: 'Modal',
  props: {
    show: Boolean,
    close: Function,
    title: {
      type: String,
      default: 'Title',
    },
    showFooter: {
      type: Boolean,
      default: true,
    },
    width: {
      type: String,
      default: '50vw',
    },
    clickOutsideHide: {
      type: Boolean,
      default: false,
    },
    minWidth: {
      type: String,
      default: 'calc(min(23rem, 100vw))',
    },
  },
  data() {
    modalId += 1;
    return {
      dialogId: `modal-dialog-${modalId}`,
      modalActive: false,
      previouslyFocused: null,
      titleId: `modal-title-${modalId}`,
    };
  },
  computed: {
    modalStyles() {
      return {
        width: this.width,
        minWidth: this.minWidth,
      };
    },
  },
  watch: {
    show: {
      immediate: true,
      handler(show) {
        if (show) {
          this.$nextTick(this.activateModal);
        } else {
          this.deactivateModal();
        }
      },
    },
  },
  beforeUnmount() {
    this.deactivateModal();
  },
  methods: {
    activateModal() {
      if (this.modalActive || !this.show || !this.$refs.dialog) return;
      this.modalActive = true;
      this.previouslyFocused = document.activeElement;
      document.addEventListener('keydown', this.handleKeydown);
      openModalCount += 1;
      document.documentElement.classList.add('modal-open');
      const focusable = this.$refs.dialog.querySelector(
        '[autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      (focusable || this.$refs.dialog).focus({ preventScroll: true });
    },
    deactivateModal() {
      document.removeEventListener('keydown', this.handleKeydown);
      if (this.modalActive) {
        this.modalActive = false;
        openModalCount = Math.max(0, openModalCount - 1);
      }
      if (openModalCount === 0) {
        document.documentElement.classList.remove('modal-open');
      }
      if (this.previouslyFocused?.isConnected) {
        this.previouslyFocused.focus({ preventScroll: true });
      }
      this.previouslyFocused = null;
    },
    handleKeydown(event) {
      if (!this.show) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close?.();
        return;
      }
      trapModalTab(event, this.$refs.dialog, document.activeElement);
    },

    clickOutside() {
      if (this.clickOutsideHide) {
        this.close();
      }
    },
  },
};
</script>

<style lang="scss" scoped>
.shade {
  background: rgba(255, 255, 255, 0.58);
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  box-sizing: border-box;
  padding: max(16px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
}

.modal {
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 12px 16px -8px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(12px) opacity(1);
  padding: 24px 0;
  border-radius: 12px;
  width: 50vw;
  margin: auto 0;
  font-size: 14px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  max-width: calc(100vw - 32px);
  max-height: calc(100dvh - 32px);
  box-sizing: border-box;

  ::-webkit-scrollbar {
    width: 4px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
    border: unset;
    width: 0;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--color-secondary-bg-for-transparent);
  }
}

@supports (-moz-appearance: none) {
  .modal {
    background: var(--color-body-bg) !important;
  }
}

.content {
  overflow: auto;
  overflow-x: hidden;
  padding: 0 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 24px 24px 24px;
  .title {
    font-weight: 600;
    font-size: 20px;
  }
  button {
    color: var(--color-text);
    border-radius: 50%;
    height: 32px;
    width: 32px;
    display: flex;
    justify-content: center;
    align-items: center;
    opacity: 0.68;
    transition: 0.2s;
    &:hover {
      opacity: 1;
      background: var(--color-secondary-bg-for-transparent);
    }
  }
  .svg-icon {
    height: 18px;
    width: 18px;
  }
}

.footer {
  padding-top: 16px;
  margin: 16px 24px 24px 24px;
  border-top: 1px solid rgba(128, 128, 128, 0.18);
  display: flex;
  justify-content: flex-end;
  margin-bottom: -8px;
  button {
    color: var(--color-text);
    background: var(--color-secondary-bg-for-transparent);
    border-radius: 8px;
    padding: 6px 16px;
    font-size: 14px;
    margin-left: 12px;
    transition: 0.2s;
    &:active {
      transform: scale(0.94);
    }
  }
  button.primary {
    color: var(--color-primary-bg);
    background: var(--color-primary-gradient);
    font-weight: 500;
  }
  button.block {
    width: 100%;
    margin-left: 0;
    &:active {
      transform: scale(0.98);
    }
  }
}

[data-theme='dark'] {
  .shade {
    background: rgba(0, 0, 0, 0.38);
    color: var(--color-text);
  }

  .modal {
    background: rgba(36, 36, 36, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
}

:global(html.modal-open),
:global(html.modal-open body) {
  overflow: hidden;
}

:global(html.modal-open main) {
  overflow: hidden !important;
}
</style>

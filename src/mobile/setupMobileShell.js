import { isCapacitor } from '@/utils/env';
import { BackgroundAudio } from '@/mobile/AndroidAudioEngine';
import store from '@/store';

const PRIMARY_ROUTE_NAMES = new Set(['home', 'explore', 'library', 'settings']);
const KEYBOARD_THRESHOLD = 120;

function isEditableElement(element) {
  return (
    element instanceof HTMLElement &&
    (element.matches('input, textarea, select') || element.isContentEditable)
  );
}

function setupMobileViewportState() {
  document.body.classList.add('mobile-shell');

  const viewport = window.visualViewport;
  if (!viewport) return;

  let focusViewportHeight = viewport.height;

  const updateViewportState = () => {
    const visualHeight = Math.round(viewport.height);
    const visualTop = Math.round(viewport.offsetTop || 0);
    document.documentElement.style.setProperty(
      '--mobile-visual-height',
      `${visualHeight}px`
    );
    document.documentElement.style.setProperty(
      '--mobile-visual-top',
      `${visualTop}px`
    );

    const editable = isEditableElement(document.activeElement);
    const keyboardOpen =
      editable && focusViewportHeight - viewport.height > KEYBOARD_THRESHOLD;
    document.body.classList.toggle('mobile-keyboard-open', keyboardOpen);

    if (!editable) focusViewportHeight = viewport.height;
  };

  document.addEventListener('focusin', event => {
    if (isEditableElement(event.target)) {
      focusViewportHeight = Math.max(focusViewportHeight, viewport.height);
    }
    requestAnimationFrame(updateViewportState);
  });

  document.addEventListener('focusout', () => {
    document.body.classList.remove('mobile-keyboard-open');
    setTimeout(() => {
      focusViewportHeight = viewport.height;
      updateViewportState();
    }, 80);
  });

  viewport.addEventListener('resize', updateViewportState);
  viewport.addEventListener('scroll', updateViewportState);
  window.addEventListener('orientationchange', () => {
    document.body.classList.remove('mobile-keyboard-open');
    setTimeout(() => {
      focusViewportHeight = viewport.height;
      updateViewportState();
    }, 120);
  });

  updateViewportState();
}

function closeMobileKeyboard() {
  const activeElement = document.activeElement;
  if (!isEditableElement(activeElement)) return false;

  if (
    document.body.classList.contains('mobile-keyboard-open') ||
    activeElement.matches('input, textarea, select')
  ) {
    activeElement.blur();
    document.body.classList.remove('mobile-keyboard-open');
    return true;
  }

  return false;
}

function closeVisibleOverlay() {
  if (store.state.showLyrics) {
    store.commit('toggleLyrics');
    return true;
  }

  const contextMenu = document.querySelector('.context-menu-layer .menu');
  if (contextMenu) {
    contextMenu.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
    return true;
  }

  const visibleModal = Array.from(
    document.querySelectorAll('.shade .modal')
  ).find(modal => modal.getClientRects().length > 0);
  const modalCloseButton = visibleModal?.querySelector('.close');
  if (modalCloseButton) {
    modalCloseButton.click();
    return true;
  }

  return false;
}

export async function setupMobileShell(router) {
  if (!isCapacitor) return;

  setupMobileViewportState();

  const [{ App }, { SplashScreen }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/splash-screen'),
    import('@capacitor/status-bar'),
  ]);

  await Promise.allSettled([
    StatusBar.setStyle({ style: Style.Default }),
    StatusBar.setOverlaysWebView({ overlay: true }),
    BackgroundAudio.requestPermissions(),
  ]);

  App.addListener('backButton', ({ canGoBack }) => {
    if (closeMobileKeyboard()) return;
    if (closeVisibleOverlay()) return;

    const currentRoute = router.currentRoute.value;
    if (!PRIMARY_ROUTE_NAMES.has(currentRoute.name) && canGoBack) {
      router.back();
      return;
    }
    if (currentRoute.name !== 'home') {
      router.replace({ name: 'home' });
      return;
    }
    App.exitApp();
  });

  await SplashScreen.hide();
}

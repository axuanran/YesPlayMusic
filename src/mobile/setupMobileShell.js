import { isCapacitor } from '@/utils/env';
import { BackgroundAudio } from '@/mobile/AndroidAudioEngine';
import store from '@/store';

const PRIMARY_ROUTE_NAMES = new Set(['home', 'explore', 'library', 'settings']);

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

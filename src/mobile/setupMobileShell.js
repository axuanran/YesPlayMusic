import { isCapacitor } from '@/utils/env';
import { BackgroundAudio } from '@/mobile/AndroidAudioEngine';

const PRIMARY_ROUTE_NAMES = new Set(['home', 'explore', 'library', 'settings']);

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

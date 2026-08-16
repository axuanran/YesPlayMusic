const appEnv = typeof __APP_ENV__ !== 'undefined' ? __APP_ENV__ : {};
const appPlatform =
  typeof __APP_PLATFORM__ !== 'undefined' ? __APP_PLATFORM__ : 'browser';

export const env = appEnv;
export const platform = appPlatform;
export const isElectron = env.IS_ELECTRON === true;
export const isDevelopment = env.NODE_ENV === 'development';

const DOWNLOAD_FEATURE_KEY = '__ypm_enable_download__';

function readDownloadFeature() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DOWNLOAD_FEATURE_KEY) === 'true';
  } catch {
    return false;
  }
}

function setDownloadFeature(enabled) {
  window.localStorage.setItem(DOWNLOAD_FEATURE_KEY, String(enabled));
  window.location.reload();
}

export const isDownloadEnabled = isElectron && readDownloadFeature();

if (typeof window !== 'undefined') {
  Object.defineProperties(window, {
    ypmEnableDownload: {
      enumerable: false,
      value: () => setDownloadFeature(true),
    },
    ypmDisableDownload: {
      enumerable: false,
      value: () => setDownloadFeature(false),
    },
  });
}

const appEnv = typeof __APP_ENV__ !== 'undefined' ? __APP_ENV__ : {};
const appPlatform =
  typeof __APP_PLATFORM__ !== 'undefined' ? __APP_PLATFORM__ : 'browser';

export const env = appEnv;
export const platform = appPlatform;
export const isElectron = env.IS_ELECTRON === true;
export const isDevelopment = env.NODE_ENV === 'development';

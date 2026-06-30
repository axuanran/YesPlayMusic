import * as audioResolver from '@/api/audioResolver';
import { pluginEvents } from './events';

export function createPluginContext({ router, store } = {}) {
  return {
    router,
    store,
    events: pluginEvents,
    audioResolver,
    settings: {
      get(key, fallbackValue) {
        const value = store?.state?.settings?.[key];
        return value === undefined ? fallbackValue : value;
      },
      set(key, value) {
        store?.commit('updateSettings', { key, value });
      },
    },
  };
}

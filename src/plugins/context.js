import * as audioResolver from '@/api/audioResolver';
import { pluginEvents } from './events';
import { getSetting, setSetting } from './settings';

export function createPluginContext({ router, store } = {}) {
  return {
    router,
    store,
    events: pluginEvents,
    audioResolver,
    settings: {
      get(key, fallbackValue) {
        return getSetting(store, key, fallbackValue);
      },
      set(key, value) {
        setSetting(store, key, value);
      },
    },
  };
}

function readSettingsFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('settings')) || {};
  } catch {
    return {};
  }
}

export const RESOLVER_ADMIN_PLUGIN_ID = 'resolver-admin';

export function applyPluginSettingLinks(settings = {}) {
  if (settings.plugins?.[RESOLVER_ADMIN_PLUGIN_ID]?.enabled !== false) {
    return settings;
  }
  return {
    ...settings,
    useAudioResolver: false,
  };
}

export function getSetting(store, key, fallbackValue) {
  const value = store?.state?.settings?.[key];
  return value === undefined ? fallbackValue : value;
}

export function setSetting(store, key, value) {
  store?.commit('updateSettings', { key, value });
}

export function getPluginSettings(settings = readSettingsFromStorage()) {
  return settings.plugins || {};
}

export function getPluginEnabled(plugin, settings) {
  // resolver-admin is the settings surface for a built-in capability. Keep
  // the page and its audio provider registered even when the resolver itself
  // is switched off; useAudioResolver controls actual resolution.
  if (plugin.id === RESOLVER_ADMIN_PLUGIN_ID) return true;
  const plugins = getPluginSettings(settings);
  const saved = plugins[plugin.id];
  return saved?.enabled ?? plugin.enabledByDefault === true;
}

export function getPluginState(plugin, settings) {
  return {
    enabled: getPluginEnabled(plugin, settings),
  };
}

export function setPluginEnabled(store, pluginId, enabled) {
  const settings = store?.state?.settings || {};
  const plugins = {
    ...(settings.plugins || {}),
    [pluginId]: {
      ...(settings.plugins?.[pluginId] || {}),
      enabled,
    },
  };

  if (pluginId === RESOLVER_ADMIN_PLUGIN_ID) {
    setSetting(store, 'useAudioResolver', enabled);
  }
  setSetting(store, 'plugins', plugins);
  return plugins;
}

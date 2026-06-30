function readSettingsFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('settings')) || {};
  } catch {
    return {};
  }
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

  setSetting(store, 'plugins', plugins);
  return plugins;
}

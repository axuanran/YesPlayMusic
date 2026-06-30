import { warnPlugin } from './manifest';

const installedPlugins = new Map();

export function installPlugin(plugin, ctx) {
  if (installedPlugins.has(plugin.id)) return installedPlugins.get(plugin.id);

  try {
    const cleanup = plugin.setup?.(ctx);
    const installedPlugin = {
      plugin,
      cleanup,
    };
    installedPlugins.set(plugin.id, installedPlugin);
    return installedPlugin;
  } catch (error) {
    warnPlugin(plugin.id, 'setup failed', error);
    return null;
  }
}

export function installPlugins(plugins, ctx) {
  plugins.forEach(plugin => installPlugin(plugin, ctx));
  return getInstalledPlugins();
}

export function disposePlugin(pluginId) {
  const installedPlugin = installedPlugins.get(pluginId);
  if (!installedPlugin) return;

  try {
    installedPlugin.cleanup?.();
  } catch (error) {
    warnPlugin(pluginId, 'dispose failed', error);
  } finally {
    installedPlugins.delete(pluginId);
  }
}

export function syncPlugins(plugins, ctx) {
  const enabledPluginIds = new Set(plugins.map(plugin => plugin.id));

  Array.from(installedPlugins.keys()).forEach(pluginId => {
    if (!enabledPluginIds.has(pluginId)) {
      disposePlugin(pluginId);
    }
  });

  installPlugins(plugins, ctx);
  return getInstalledPlugins();
}

export function getInstalledPlugins() {
  return Array.from(installedPlugins.values());
}

export function resetPluginRuntimeForTest() {
  installedPlugins.clear();
}

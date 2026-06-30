import { warnPlugin } from './manifest';

export function createPluginRuntime() {
  const installedPlugins = new Map();

  function installPlugin(plugin, ctx) {
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

  function installPlugins(plugins, ctx) {
    plugins.forEach(plugin => installPlugin(plugin, ctx));
    return getInstalledPlugins();
  }

  function disposePlugin(pluginId) {
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

  function syncPlugins(plugins, ctx) {
    const enabledPluginIds = new Set(plugins.map(plugin => plugin.id));

    Array.from(installedPlugins.keys()).forEach(pluginId => {
      if (!enabledPluginIds.has(pluginId)) {
        disposePlugin(pluginId);
      }
    });

    installPlugins(plugins, ctx);
    return getInstalledPlugins();
  }

  function getInstalledPlugins() {
    return Array.from(installedPlugins.values());
  }

  return {
    disposePlugin,
    getInstalledPlugins,
    installPlugin,
    installPlugins,
    syncPlugins,
  };
}

const defaultPluginRuntime = createPluginRuntime();

export const {
  disposePlugin,
  getInstalledPlugins,
  installPlugin,
  installPlugins,
  syncPlugins,
} = defaultPluginRuntime;

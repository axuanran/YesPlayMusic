import { warnPlugin } from './manifest';

export function createPluginRuntime() {
  const installedPlugins = new Map();
  const pluginHealth = new Map();

  function setPluginHealth(pluginId, patch) {
    pluginHealth.set(pluginId, {
      ...pluginHealth.get(pluginId),
      ...patch,
    });
  }

  function installPlugin(plugin, ctx) {
    if (installedPlugins.has(plugin.id)) return installedPlugins.get(plugin.id);

    try {
      const cleanup = plugin.setup?.(ctx);
      const installedPlugin = {
        plugin,
        cleanup,
      };
      installedPlugins.set(plugin.id, installedPlugin);
      setPluginHealth(plugin.id, {
        setupError: undefined,
        setupErrorAt: undefined,
        installedAt: Date.now(),
      });
      return installedPlugin;
    } catch (error) {
      warnPlugin(plugin.id, 'setup failed', error);
      setPluginHealth(plugin.id, {
        setupError: error?.message || String(error),
        setupErrorAt: Date.now(),
      });
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
      setPluginHealth(pluginId, {
        disposeError: undefined,
        disposeErrorAt: undefined,
        disposedAt: Date.now(),
      });
    } catch (error) {
      warnPlugin(pluginId, 'dispose failed', error);
      setPluginHealth(pluginId, {
        disposeError: error?.message || String(error),
        disposeErrorAt: Date.now(),
      });
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

  function getPluginHealth(pluginId) {
    return pluginHealth.get(pluginId) || {};
  }

  return {
    disposePlugin,
    getPluginHealth,
    getInstalledPlugins,
    installPlugin,
    installPlugins,
    syncPlugins,
  };
}

const defaultPluginRuntime = createPluginRuntime();

export const {
  disposePlugin,
  getPluginHealth,
  getInstalledPlugins,
  installPlugin,
  installPlugins,
  syncPlugins,
} = defaultPluginRuntime;

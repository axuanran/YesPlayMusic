import resolverAdminPlugin from './builtin/resolver-admin/manifest';

const builtinPlugins = [resolverAdminPlugin];
const installedPlugins = new Map();

const requiredManifestFields = ['id', 'name', 'version', 'type'];

function warnPlugin(pluginId, message, error) {
  console.warn(`[plugins:${pluginId}] ${message}`, error || '');
}

function validatePlugin(plugin, seenIds) {
  if (!plugin || typeof plugin !== 'object') {
    warnPlugin('unknown', 'invalid manifest');
    return false;
  }

  const missingField = requiredManifestFields.find(field => !plugin[field]);
  if (missingField) {
    warnPlugin(
      plugin.id || 'unknown',
      `missing manifest field: ${missingField}`
    );
    return false;
  }

  if (seenIds.has(plugin.id)) {
    warnPlugin(plugin.id, 'duplicate plugin id');
    return false;
  }

  seenIds.add(plugin.id);
  return true;
}

function readSettings() {
  try {
    return JSON.parse(localStorage.getItem('settings')) || {};
  } catch {
    return {};
  }
}

export function getPluginSettings() {
  const settings = readSettings();
  return settings.plugins || {};
}

export function getPluginState(plugin) {
  const plugins = getPluginSettings();
  const saved = plugins[plugin.id];
  return {
    enabled: saved?.enabled ?? plugin.enabledByDefault === true,
  };
}

export function getBuiltinPlugins() {
  const seenIds = new Set();
  return builtinPlugins
    .filter(plugin => validatePlugin(plugin, seenIds))
    .map(plugin => ({
      ...plugin,
      state: getPluginState(plugin),
    }));
}

export function getEnabledPlugins() {
  return getBuiltinPlugins().filter(plugin => plugin.state.enabled);
}

export function getPluginRoutes() {
  return getEnabledPlugins().flatMap(plugin => plugin.routes || []);
}

export function installPlugins(ctx) {
  getEnabledPlugins().forEach(plugin => {
    if (installedPlugins.has(plugin.id)) return;
    try {
      const cleanup = plugin.setup?.(ctx);
      installedPlugins.set(plugin.id, {
        plugin,
        cleanup,
      });
    } catch (error) {
      warnPlugin(plugin.id, 'setup failed', error);
    }
  });
  return Array.from(installedPlugins.values());
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

export function syncPlugins(ctx) {
  const enabledPluginIds = new Set(
    getEnabledPlugins().map(plugin => plugin.id)
  );

  Array.from(installedPlugins.keys()).forEach(pluginId => {
    if (!enabledPluginIds.has(pluginId)) {
      disposePlugin(pluginId);
    }
  });

  installPlugins(ctx);
  return Array.from(installedPlugins.values());
}

import resolverAdminPlugin from './builtin/resolver-admin/manifest';
import neteaseApiPlugin from './builtin/netease-api/manifest';
import { normalizePluginManifest, validatePluginManifest } from './manifest';
import { getPluginSettings, getPluginState } from './settings';
import {
  disposePlugin as disposeRuntimePlugin,
  getPluginHealth,
  installPlugins as installRuntimePlugins,
  syncPlugins as syncRuntimePlugins,
} from './runtime';
import { collectPluginRoutes } from './routes';

const builtinPlugins = [resolverAdminPlugin, neteaseApiPlugin];

export { getPluginSettings };

export function getBuiltinPlugins() {
  const seenIds = new Set();
  return builtinPlugins
    .map(normalizePluginManifest)
    .filter(plugin => validatePluginManifest(plugin, seenIds))
    .map(plugin => ({
      ...plugin,
      health: getPluginHealth(plugin.id),
      state: getPluginState(plugin),
    }));
}

export function getEnabledPlugins() {
  return getBuiltinPlugins().filter(plugin => plugin.state.enabled);
}

export function getPluginRoutes() {
  return collectPluginRoutes(getEnabledPlugins());
}

export function installPlugins(ctx) {
  return installRuntimePlugins(getEnabledPlugins(), ctx);
}

export function disposePlugin(pluginId) {
  disposeRuntimePlugin(pluginId);
}

export function syncPlugins(ctx) {
  return syncRuntimePlugins(getEnabledPlugins(), ctx);
}

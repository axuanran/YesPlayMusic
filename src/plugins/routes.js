export function collectPluginRoutes(plugins) {
  return plugins.flatMap(plugin => plugin.routes || []);
}

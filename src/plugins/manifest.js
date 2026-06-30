const requiredManifestFields = ['id', 'name', 'version', 'type'];

export function warnPlugin(pluginId, message, error) {
  console.warn(`[plugins:${pluginId}] ${message}`, error || '');
}

export function validatePluginManifest(plugin, seenIds = new Set()) {
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

export function normalizePluginManifest(plugin) {
  return {
    enabledByDefault: false,
    routes: [],
    ...plugin,
  };
}

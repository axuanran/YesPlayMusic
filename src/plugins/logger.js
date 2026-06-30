function formatScope(scope) {
  return scope ? `[plugins:${scope}]` : '[plugins]';
}

export function createPluginLogger(scope) {
  const prefix = formatScope(scope);
  return {
    debug(...args) {
      if (import.meta.env?.DEV) {
        console.debug(prefix, ...args);
      }
    },
    warn(...args) {
      console.warn(prefix, ...args);
    },
    error(...args) {
      console.error(prefix, ...args);
    },
  };
}

export const pluginLogger = createPluginLogger();

export function createPluginEvents() {
  const listeners = new Map();

  return {
    on(event, handler) {
      const handlers = listeners.get(event) || new Set();
      handlers.add(handler);
      listeners.set(event, handlers);
      return () => handlers.delete(handler);
    },
    emit(event, payload) {
      const handlers = listeners.get(event);
      if (!handlers) return;
      handlers.forEach(handler => handler(payload));
    },
    clear() {
      listeners.clear();
    },
  };
}

export const pluginEvents = createPluginEvents();

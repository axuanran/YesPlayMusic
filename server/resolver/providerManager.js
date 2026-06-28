// Provider registry: loads and manages audio source providers

const providers = new Map();

/**
 * Register a provider module.
 * Each provider must export: { providerName: string, resolve(trackId, context): Promise }
 */
export function registerProvider(module) {
  if (!module.providerName || typeof module.resolve !== 'function') {
    throw new Error(`Invalid provider module: missing providerName or resolve function`);
  }
  providers.set(module.providerName, module);
}

export function get(providerName) {
  return providers.get(providerName);
}

export function list() {
  return Array.from(providers.keys());
}

export const providerManager = {
  register: registerProvider,
  get,
  list,
};

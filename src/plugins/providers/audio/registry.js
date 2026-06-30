import store from '@/store';
import { pluginEvents } from '@/plugins/events';
import { createPluginLogger } from '@/plugins/logger';
import { getResolverQuality } from './quality';

const logger = createPluginLogger('audio-provider');
function normalizeProvider(provider) {
  if (!provider?.id || typeof provider.resolve !== 'function') {
    throw new Error('invalid audio provider');
  }

  return {
    name: provider.id,
    priority: 100,
    enabled: () => true,
    ...provider,
  };
}

function normalizeResolveResult(provider, result, quality) {
  const playUrl = typeof result === 'string' ? result : result?.playUrl;
  if (!playUrl) return null;
  return {
    ok: true,
    providerId: provider.id,
    quality,
    meta: {},
    ...(typeof result === 'string' ? {} : result),
    playUrl,
  };
}

export function createAudioProviderRegistry({
  getQuality = getResolverQuality,
  logger: providerLogger = logger,
  providerStore = store,
  events = pluginEvents,
} = {}) {
  const audioProviders = new Map();
  const providerStatus = new Map();

  function registerAudioProvider(provider) {
    const normalizedProvider = normalizeProvider(provider);
    audioProviders.set(normalizedProvider.id, normalizedProvider);
    return () => unregisterAudioProvider(normalizedProvider.id);
  }

  function unregisterAudioProvider(providerId) {
    audioProviders.delete(providerId);
    providerStatus.delete(providerId);
  }

  function updateProviderStatus(providerId, patch) {
    providerStatus.set(providerId, {
      ...providerStatus.get(providerId),
      ...patch,
    });
  }

  function getAudioProviders() {
    return Array.from(audioProviders.values())
      .map(provider => ({
        ...provider,
        ...providerStatus.get(provider.id),
        active: provider.enabled?.() !== false,
      }))
      .sort((a, b) => b.priority - a.priority);
  }

  function getAudioProviderStatus() {
    return getAudioProviders().map(provider => ({
      id: provider.id,
      name: provider.name,
      priority: provider.priority,
      active: provider.active,
      lastError: provider.lastError,
      lastErrorAt: provider.lastErrorAt,
      lastSuccessAt: provider.lastSuccessAt,
    }));
  }

  async function resolveTrackSourceWithProviders(track, qualityOverride) {
    const quality = qualityOverride || getQuality();
    events.emit('audio:resolve:start', { track, quality });

    for (const provider of getAudioProviders()) {
      if (!provider.active) continue;
      try {
        const result = await provider.resolve(track, quality, {
          store: providerStore,
          events,
        });
        const normalizedResult = normalizeResolveResult(
          provider,
          result,
          quality
        );
        if (!normalizedResult) continue;
        updateProviderStatus(provider.id, {
          lastError: undefined,
          lastErrorAt: undefined,
          lastSuccessAt: Date.now(),
          lastResult: {
            providerId: normalizedResult.providerId,
            quality: normalizedResult.quality,
            playUrl: normalizedResult.playUrl,
          },
        });
        events.emit('audio:resolve:success', {
          track,
          quality,
          providerId: provider.id,
        });
        return normalizedResult.playUrl;
      } catch (error) {
        const message = error?.message || String(error);
        updateProviderStatus(provider.id, {
          lastError: message,
          lastErrorAt: Date.now(),
        });
        events.emit('audio:resolve:error', {
          track,
          quality,
          providerId: provider.id,
          error,
        });
        providerLogger.warn(`${provider.id} resolve failed`, error);
      }
    }

    return null;
  }

  return {
    getAudioProviders,
    getAudioProviderStatus,
    registerAudioProvider,
    resolveTrackSourceWithProviders,
    unregisterAudioProvider,
  };
}

const defaultAudioProviderRegistry = createAudioProviderRegistry();

export const {
  getAudioProviders,
  getAudioProviderStatus,
  registerAudioProvider,
  resolveTrackSourceWithProviders,
  unregisterAudioProvider,
} = defaultAudioProviderRegistry;

import store from '@/store';
import { pluginEvents } from '@/plugins/events';
import { createPluginLogger } from '@/plugins/logger';
import { getResolverQuality } from './quality';

const logger = createPluginLogger('audio-provider');
const audioProviders = new Map();
const providerStatus = new Map();

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

export function registerAudioProvider(provider) {
  const normalizedProvider = normalizeProvider(provider);
  audioProviders.set(normalizedProvider.id, normalizedProvider);
  return () => unregisterAudioProvider(normalizedProvider.id);
}

export function unregisterAudioProvider(providerId) {
  audioProviders.delete(providerId);
  providerStatus.delete(providerId);
}

function updateProviderStatus(providerId, patch) {
  providerStatus.set(providerId, {
    ...providerStatus.get(providerId),
    ...patch,
  });
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

export function getAudioProviders() {
  return Array.from(audioProviders.values())
    .map(provider => ({
      ...provider,
      ...providerStatus.get(provider.id),
      active: provider.enabled?.() !== false,
    }))
    .sort((a, b) => b.priority - a.priority);
}

export function getAudioProviderStatus() {
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

export async function resolveTrackSourceWithProviders(track, qualityOverride) {
  const quality = qualityOverride || getResolverQuality();
  pluginEvents.emit('audio:resolve:start', { track, quality });

  for (const provider of getAudioProviders()) {
    if (!provider.active) continue;
    try {
      const result = await provider.resolve(track, quality, {
        store,
        events: pluginEvents,
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
      pluginEvents.emit('audio:resolve:success', {
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
      pluginEvents.emit('audio:resolve:error', {
        track,
        quality,
        providerId: provider.id,
        error,
      });
      logger.warn(`${provider.id} resolve failed`, error);
    }
  }

  return null;
}

export function resetAudioProvidersForTest() {
  audioProviders.clear();
  providerStatus.clear();
}

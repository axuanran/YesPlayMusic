import { pluginEvents } from '@/plugins/events';
import { AUDIO_PROVIDER_EVENTS } from '@/plugins/eventsCatalog';
import { createPluginLogger } from '@/plugins/logger';
import { getResolverQuality } from './quality';

const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

function getRuntimeStore() {
  return globalThis?.yesplaymusicStore;
}

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

function getTrackId(track) {
  return typeof track === 'object' ? track?.id : track;
}

function getCacheKey(track, quality) {
  const trackId = getTrackId(track);
  if (!trackId) return null;
  return `${trackId}:${quality}`;
}

export function createAudioProviderRegistry({
  getQuality = getResolverQuality,
  logger: providerLogger = logger,
  providerStore = getRuntimeStore(),
  events = pluginEvents,
  cacheTtl = DEFAULT_CACHE_TTL,
  now = () => Date.now(),
} = {}) {
  const audioProviders = new Map();
  const providerStatus = new Map();
  const sourceCache = new Map();

  function registerAudioProvider(provider) {
    const normalizedProvider = normalizeProvider(provider);
    audioProviders.set(normalizedProvider.id, normalizedProvider);
    return () => unregisterAudioProvider(normalizedProvider.id);
  }

  function unregisterAudioProvider(providerId) {
    audioProviders.delete(providerId);
    providerStatus.delete(providerId);
  }

  function getCachedSource(cacheKey) {
    if (!cacheKey) return null;
    const cached = sourceCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= now()) {
      sourceCache.delete(cacheKey);
      return null;
    }
    const provider = audioProviders.get(cached.providerId);
    if (!provider || provider.enabled?.() === false) {
      sourceCache.delete(cacheKey);
      return null;
    }
    return cached.playUrl;
  }

  function setCachedSource(cacheKey, playUrl, providerId, cacheTtlOverride) {
    const requestedTtl = Number(cacheTtlOverride);
    const effectiveTtl = Number.isFinite(requestedTtl)
      ? Math.max(0, requestedTtl)
      : cacheTtl;
    if (!cacheKey || !playUrl || effectiveTtl <= 0) return;
    sourceCache.set(cacheKey, {
      playUrl,
      providerId,
      expiresAt: now() + effectiveTtl,
    });
  }

  function clearAudioProviderCache() {
    sourceCache.clear();
  }

  function getProviderStore() {
    return providerStore || getRuntimeStore();
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
      lastResult: provider.lastResult,
      lastSuccessAt: provider.lastSuccessAt,
    }));
  }

  async function resolveTrackSourceWithProviders(
    track,
    qualityOverride,
    options = {}
  ) {
    const quality = qualityOverride || getQuality();
    const cacheKey = getCacheKey(track, quality);
    const cachedSource = options.bypassCache ? null : getCachedSource(cacheKey);
    if (cachedSource) return cachedSource;

    events.emit(AUDIO_PROVIDER_EVENTS.RESOLVE_START, { track, quality });

    for (const provider of getAudioProviders()) {
      if (!provider.active) continue;
      try {
        const result = await provider.resolve(track, quality, {
          store: getProviderStore(),
          events,
          bypassCache: options.bypassCache === true,
          signal: options.signal,
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
        events.emit(AUDIO_PROVIDER_EVENTS.RESOLVE_SUCCESS, {
          track,
          quality,
          providerId: provider.id,
        });
        setCachedSource(
          cacheKey,
          normalizedResult.playUrl,
          provider.id,
          normalizedResult.cacheTtlMs
        );
        return normalizedResult.playUrl;
      } catch (error) {
        const message = error?.message || String(error);
        updateProviderStatus(provider.id, {
          lastError: message,
          lastErrorAt: Date.now(),
        });
        events.emit(AUDIO_PROVIDER_EVENTS.RESOLVE_ERROR, {
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
    clearAudioProviderCache,
    registerAudioProvider,
    resolveTrackSourceWithProviders,
    unregisterAudioProvider,
  };
}

const defaultAudioProviderRegistry = createAudioProviderRegistry();

export const {
  clearAudioProviderCache,
  getAudioProviders,
  getAudioProviderStatus,
  registerAudioProvider,
  resolveTrackSourceWithProviders,
  unregisterAudioProvider,
} = defaultAudioProviderRegistry;

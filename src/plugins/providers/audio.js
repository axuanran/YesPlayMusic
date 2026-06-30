import store from '@/store';
import { resolveAudioByBackend, isResolverEnabled } from '@/api/audioResolver';
import { pluginEvents } from '@/plugins/events';

const audioProviders = new Map();
const providerErrors = new Map();

function getResolverQuality() {
  const quality = store.state.settings?.musicQuality ?? 320000;
  switch (quality) {
    case 'standard':
    case 'exhigh':
    case 'lossless':
    case 'hires':
    case 'jyeffect':
    case 'sky':
    case 'jymaster':
      return quality;
    case 128000:
      return 'standard';
    case 192000:
    case 320000:
      return 'exhigh';
    case 'flac':
    case 350000:
      return 'lossless';
    case 999000:
      return 'hires';
    default:
      return 'standard';
  }
}

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
  providerErrors.delete(providerId);
}

export function getAudioProviders() {
  return Array.from(audioProviders.values())
    .map(provider => ({
      ...provider,
      lastError: providerErrors.get(provider.id),
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
      const playUrl = typeof result === 'string' ? result : result?.playUrl;
      if (!playUrl) continue;
      providerErrors.delete(provider.id);
      pluginEvents.emit('audio:resolve:success', {
        track,
        quality,
        providerId: provider.id,
      });
      return playUrl;
    } catch (error) {
      const message = error?.message || String(error);
      providerErrors.set(provider.id, message);
      pluginEvents.emit('audio:resolve:error', {
        track,
        quality,
        providerId: provider.id,
        error,
      });
      console.warn(`[audio-provider:${provider.id}] resolve failed:`, error);
    }
  }

  return null;
}

registerAudioProvider({
  id: 'resolver-audio-provider',
  name: 'Resolver Audio Provider',
  priority: 1000,
  enabled: () => isResolverEnabled(),
  async resolve(track, quality) {
    const trackId = typeof track === 'object' ? track.id : track;
    const result = await resolveAudioByBackend(trackId, quality, {
      track: typeof track === 'object' ? track : undefined,
    });
    return result.playUrl;
  },
});

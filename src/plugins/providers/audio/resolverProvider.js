import { resolveAudioByBackend, isResolverEnabled } from '@/api/audioResolver';
import { registerAudioProvider } from './registry';

export function registerResolverAudioProvider() {
  return registerAudioProvider({
    id: 'resolver-audio-provider',
    name: 'Resolver Audio Provider',
    priority: 1000,
    enabled: () => isResolverEnabled(),
    async resolve(track, quality, context = {}) {
      const trackId = typeof track === 'object' ? track.id : track;
      const result = await resolveAudioByBackend(trackId, quality, {
        bypassCache: context.bypassCache,
        track: typeof track === 'object' ? track : undefined,
        signal: context.signal,
      });
      return {
        ok: true,
        playUrl: result.playUrl,
        providerId: 'resolver-audio-provider',
        quality: result.quality || quality,
        meta: {
          mode: result.mode,
          source: result.source,
          expiresAt: result.expiresAt,
        },
      };
    },
  });
}

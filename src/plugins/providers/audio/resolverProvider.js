import { resolveAudioByBackend, isResolverEnabled } from '@/api/audioResolver';
import { registerAudioProvider } from './registry';

export function registerResolverAudioProvider() {
  return registerAudioProvider({
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
}

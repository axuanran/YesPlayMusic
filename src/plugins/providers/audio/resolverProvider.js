import { getMP3 } from '@/api/track';
import { isResolverEnabled } from '@/api/audioResolver';
import { isAccountLoggedIn } from '@/utils/auth';
import { registerAudioProvider } from './registry';

function normalizeTrackId(track) {
  return typeof track === 'object' ? track?.id : track;
}

function outerUrl(trackId) {
  return `https://music.163.com/song/media/outer/url?id=${trackId}`;
}

export function registerResolverAudioProvider() {
  return registerAudioProvider({
    id: 'embedded-audio-provider',
    name: '内置音频解析',
    priority: 1000,
    enabled: () => isResolverEnabled(),
    async resolve(track, quality, context = {}) {
      const trackId = normalizeTrackId(track);
      if (!trackId) return null;

      const result = await getMP3(trackId, {
        quality,
        signal: context.signal,
      });
      const song = result?.data?.[0];
      if (song?.url && song.freeTrialInfo == null) {
        return {
          ok: true,
          playUrl: song.url.replace(/^http:/, 'https:'),
          providerId: 'embedded-audio-provider',
          quality: song.level || quality,
          meta: { source: 'netease', br: song.br, size: song.size },
        };
      }

      if (isAccountLoggedIn()) return null;
      return {
        ok: true,
        playUrl: outerUrl(trackId),
        providerId: 'embedded-audio-provider',
        quality,
        meta: { source: 'netease-outer' },
      };
    },
  });
}

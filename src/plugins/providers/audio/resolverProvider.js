import { getMP3 } from '@/api/track';
import {
  isResolverEnabled,
  resolveAudioByBackend,
} from '@/api/audioResolver';
import { isAccountLoggedIn } from '@/utils/auth';
import { isCapacitor } from '@/utils/env';
import { registerAudioProvider } from './registry';

function normalizeTrackId(track) {
  return typeof track === 'object' ? track?.id : track;
}

function outerUrl(trackId) {
  return `https://music.163.com/song/media/outer/url?id=${trackId}`;
}

async function resolveWithUiProvider(track, quality, context = {}) {
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
}

async function resolveWithBundledResolver(track, quality, context = {}) {
  const trackId = normalizeTrackId(track);
  if (!trackId) return null;

  const result = await resolveAudioByBackend(trackId, quality, {
    bypassCache: context.bypassCache,
    track: typeof track === 'object' ? track : undefined,
    signal: context.signal,
  });

  return {
    ok: true,
    playUrl: result.playUrl,
    providerId: 'embedded-audio-provider',
    quality: result.quality || quality,
    meta: {
      mode: result.mode,
      source: result.source,
      provider: result.provider,
      expiresAt: result.expiresAt,
      tried: result.tried,
    },
  };
}

export function registerResolverAudioProvider() {
  return registerAudioProvider({
    id: 'embedded-audio-provider',
    name: '内置音频解析',
    priority: 1000,
    enabled: () => isResolverEnabled(),
    resolve(track, quality, context = {}) {
      // Electron and Docker already bundle the complete resolver service with
      // netease/lx/unblock/fallback providers. Android cannot run those Node
      // providers, so it keeps the UI/native-compatible direct resolver path.
      return isCapacitor
        ? resolveWithUiProvider(track, quality, context)
        : resolveWithBundledResolver(track, quality, context);
    },
  });
}

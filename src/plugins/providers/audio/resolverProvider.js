import { getMP3 } from '@/api/track';
import { isResolverEnabled, resolveAudioByBackend } from '@/api/audioResolver';
import { isAccountLoggedIn } from '@/utils/auth';
import { isCapacitor } from '@/utils/env';
import { registerAudioProvider } from './registry';

let bundledResolverAvailable = null;

function normalizeTrackId(track) {
  return typeof track === 'object' ? track?.id : track;
}

function outerUrl(trackId) {
  return `https://music.163.com/song/media/outer/url?id=${trackId}`;
}

function isBundledResolverMissing(error) {
  const status = error?.response?.status;
  return !error?.response || status === 404 || status === 405;
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

async function resolveForCurrentRuntime(track, quality, context = {}) {
  if (isCapacitor || bundledResolverAvailable === false) {
    return resolveWithUiProvider(track, quality, context);
  }

  try {
    const result = await resolveWithBundledResolver(track, quality, context);
    bundledResolverAvailable = true;
    return result;
  } catch (error) {
    // Electron and Docker provide /resolver-api. Static deployments (for
    // example Cloudflare Pages/Workers serving only the UI) do not. Remember
    // that absence after the first probe, while still allowing an available
    // resolver that returned a track-specific error to be retried later.
    if (isBundledResolverMissing(error)) bundledResolverAvailable = false;
    return resolveWithUiProvider(track, quality, context);
  }
}

export function registerResolverAudioProvider() {
  return registerAudioProvider({
    id: 'embedded-audio-provider',
    name: '内置音频解析',
    priority: 1000,
    enabled: () => isResolverEnabled(),
    resolve: resolveForCurrentRuntime,
  });
}

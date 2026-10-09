// LLM enrichment for the track intelligence library. Given a track's
// metadata (and optionally a few lyric lines), the LLM derives structured,
// program-usable fields: tags, mood and isLive. The program validates the
// JSON shape before anything reaches the store, and every failure resolves
// to null — enrichment is opportunistic, never blocking playback.

import { extractJsonObject } from './radioEngine.js';
import { normalizeTrackId } from './trackIntel.js';

// Renderer-side tracks know their source by flag; candidates from the pool
// carry a namespaced id already.
export function namespacedTrackId(track = {}) {
  if (typeof track.id !== 'string' && !Number.isInteger(track.id)) return '';
  const raw = String(track.id);
  if (raw.includes(':')) return normalizeTrackId(raw);
  if (track.local) return `local:${raw}`;
  if (track.streaming) return `emby:${raw}`;
  return `ne:${raw}`;
}

export function buildEnrichmentPrompt({ track = {}, lyricLines = [] } = {}) {
  return [
    '根据以下信息为一首歌生成结构化标签。',
    `歌名：${track.name || '未知'}`,
    `歌手：${track.artists || '未知'}`,
    `专辑：${track.album || '未知'}`,
    lyricLines.length ? `歌词片段：\n${lyricLines.slice(0, 8).join('\n')}` : '',
    '只输出 JSON：{"tags":["最多6个标签：流派/情绪/场景/语言，小写"],"mood":"不超过8字的情绪概括","isLive":true或false}',
  ]
    .filter(Boolean)
    .join('\n');
}

export function parseEnrichmentOutput(text) {
  const parsed = extractJsonObject(text);
  if (!parsed) return null;
  const tags = (Array.isArray(parsed.tags) ? parsed.tags : [])
    .filter(tag => typeof tag === 'string')
    .map(tag => tag.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  if (tags.length === 0) return null;
  return {
    tags,
    mood:
      typeof parsed.mood === 'string' ? parsed.mood.trim().slice(0, 32) : '',
    ...(typeof parsed.isLive === 'boolean' ? { isLive: parsed.isLive } : {}),
  };
}

// Opportunistic enrichment: skip when the LLM is unavailable, the track was
// enriched recently, or the output does not parse. Returns the stored track
// or null.
export async function maybeEnrichTrack({
  assistant,
  track,
  lyricLines = [],
} = {}) {
  try {
    const id = namespacedTrackId(track);
    if (!id || typeof assistant?.llmChat !== 'function') return null;
    if (
      typeof assistant.trackNeedsEnrichment === 'function' &&
      !(await assistant.trackNeedsEnrichment({ id }))
    ) {
      return null;
    }
    const output = await assistant.llmChat({
      system:
        '你是音乐标签提取器。根据歌名、歌手、专辑和歌词片段为歌曲生成结构化标签，只输出要求的 JSON。',
      prompt: buildEnrichmentPrompt({ track, lyricLines }),
      maxTokens: 400,
    });
    const derived = parseEnrichmentOutput(output);
    if (!derived) return null;
    return (await assistant.trackSetDerived?.({ id, derived })) ?? null;
  } catch {
    return null;
  }
}

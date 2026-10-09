// Track intelligence library for the AI music assistant. Every track the
// user has heard, liked, skipped, or explicitly added (manually or via AI
// expansion) is upserted here with structured, program-usable fields. This
// is the shared foundation for rule-based filtering (now), similarity-based
// song finding (P4) and the lyric tutor context (P2).
//
// Storage lives in the main process (electron-store key `assistantTracks`),
// injected for testability. IDs are namespaced (`ne:<id>` for NetEase,
// `local:<hash>`, `emby:<key>`) so multi-source tracks never collide.

export const MAX_TRACK_ENTRIES = 2000;

export const TRACK_SOURCES = ['netease', 'local', 'streaming'];

const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const now = () => Date.now();

export const LIVE_NAME_PATTERN = /(现场|演唱会|live|concert|unplugged)/i;

export function normalizeTrackId(raw) {
  if (typeof raw !== 'string') return '';
  const id = raw.trim().slice(0, 128);
  return id.includes(':') ? id : id ? `ne:${id}` : '';
}

export function detectLiveFromText({ name = '', album = '' } = {}) {
  return LIVE_NAME_PATTERN.test(name) || LIVE_NAME_PATTERN.test(album);
}

export function normalizeLearnedTrack(raw = {}, fallbackId = '') {
  const track = isRecord(raw) ? raw : {};
  const id = normalizeTrackId(track.id) || normalizeTrackId(fallbackId);
  if (!id) return null;
  const heard = isRecord(track.heard) ? track.heard : {};
  const derived = isRecord(track.derived) ? track.derived : {};
  const added = isRecord(track.added) ? track.added : {};
  return {
    id,
    name: typeof track.name === 'string' ? track.name.slice(0, 200) : '',
    artists:
      typeof track.artists === 'string' ? track.artists.slice(0, 200) : '',
    album: typeof track.album === 'string' ? track.album.slice(0, 200) : '',
    durationMs: Number.isFinite(track.durationMs)
      ? Math.max(0, Math.round(track.durationMs))
      : null,
    source: TRACK_SOURCES.includes(track.source) ? track.source : 'netease',
    heard: {
      count: Number.isFinite(heard.count) ? heard.count : 0,
      lastAt: Number.isFinite(heard.lastAt) ? heard.lastAt : 0,
      completedCount: Number.isFinite(heard.completedCount)
        ? heard.completedCount
        : 0,
      skipQuickCount: Number.isFinite(heard.skipQuickCount)
        ? heard.skipQuickCount
        : 0,
    },
    liked: typeof track.liked === 'boolean' ? track.liked : null,
    added: {
      at: Number.isFinite(added.at) ? added.at : now(),
      by: ['heard', 'manual', 'ai', 'system'].includes(added.by)
        ? added.by
        : 'heard',
    },
    derived: {
      tags: (Array.isArray(derived.tags) ? derived.tags : [])
        .filter(tag => typeof tag === 'string')
        .map(tag => tag.trim().toLowerCase().slice(0, 32))
        .filter(Boolean)
        .slice(0, 12),
      mood: typeof derived.mood === 'string' ? derived.mood.slice(0, 32) : '',
      isLive:
        typeof derived.isLive === 'boolean'
          ? derived.isLive
          : detectLiveFromText({ name: track.name, album: track.album }),
      enrichedAt: Number.isFinite(derived.enrichedAt) ? derived.enrichedAt : 0,
      // 音频特征（tempo/energy 等）由 opt-in 的离线音频分析填充，P4 用
      ...(isRecord(derived.audio) ? { audio: derived.audio } : {}),
    },
  };
}

export function normalizeTrackLibrary(raw = {}) {
  const list = Array.isArray(raw) ? raw : raw?.tracks;
  const tracks = (Array.isArray(list) ? list : [])
    .map(track => normalizeLearnedTrack(track))
    .filter(Boolean)
    .slice(-MAX_TRACK_ENTRIES);
  return { tracks };
}

const emptyLibrary = () => normalizeTrackLibrary({ tracks: [] });

export function createTrackIntel({ store, key = 'assistantTracks' } = {}) {
  const read = () => normalizeTrackLibrary(store?.get?.(key) || emptyLibrary());
  const write = library => {
    store?.set?.(key, library);
    return library;
  };
  const find = (library, id) =>
    library.tracks.findIndex(track => track.id === normalizeTrackId(id));

  return {
    get(id) {
      const library = read();
      const index = find(library, id);
      return index < 0 ? null : library.tracks[index];
    },

    list({ limit = 100, offset = 0 } = {}) {
      const tracks = read().tracks;
      return {
        items: tracks
          .slice()
          .reverse()
          .slice(offset, offset + limit),
        total: tracks.length,
        offset,
        limit,
      };
    },

    // 人工 / AI 加入候选池；已存在的曲目只更新 added.by 优先级
    upsert(rawTrack, { by = 'manual' } = {}) {
      const normalized = normalizeLearnedTrack(rawTrack);
      if (!normalized) return null;
      normalized.added.by = ['heard', 'manual', 'ai', 'system'].includes(by)
        ? by
        : 'manual';
      const library = read();
      const index = find(library, normalized.id);
      if (index >= 0) {
        const existing = library.tracks[index];
        library.tracks[index] = {
          ...normalized,
          heard: existing.heard,
          liked: existing.liked,
          derived: { ...normalized.derived, ...existing.derived },
        };
      } else {
        library.tracks.push(normalized);
      }
      write(normalizeTrackLibrary(library));
      return this.get(normalized.id);
    },

    // heard 管线：播放完成/跳过/喜欢信号累加计数
    recordHeard(id, { completed = false, skipQuick = false } = {}) {
      const trackId = normalizeTrackId(id);
      if (!trackId) return null;
      const library = read();
      let index = find(library, trackId);
      if (index < 0) {
        library.tracks.push(normalizeLearnedTrack({ id: trackId }, trackId));
        index = library.tracks.length - 1;
      }
      const track = library.tracks[index];
      track.heard.count += 1;
      track.heard.lastAt = now();
      if (completed) track.heard.completedCount += 1;
      if (skipQuick) track.heard.skipQuickCount += 1;
      track.added.by = 'heard';
      write(normalizeTrackLibrary(library));
      return track;
    },

    setLiked(id, liked) {
      const library = read();
      const index = find(library, id);
      if (index < 0) return null;
      library.tracks[index].liked = liked === true;
      write(normalizeTrackLibrary(library));
      return library.tracks[index];
    },

    // LLM/音频富化结果落库；enrichedAt 默认取当前时间，显式传 0 可强制重富化
    setDerived(id, derived = {}) {
      const library = read();
      const index = find(library, id);
      if (index < 0) return null;
      const withStamp = {
        ...derived,
        enrichedAt: Number.isFinite(derived.enrichedAt)
          ? derived.enrichedAt
          : now(),
      };
      const merged = normalizeLearnedTrack({
        ...library.tracks[index],
        derived: withStamp,
      });
      merged.heard = library.tracks[index].heard;
      merged.liked = library.tracks[index].liked;
      library.tracks[index] = merged;
      write(normalizeTrackLibrary(library));
      return merged;
    },

    needsEnrichment(id, maxAgeMs = 7 * 24 * 3600_000) {
      const track = this.get(id);
      if (!track) return false;
      return (
        !track.derived.enrichedAt || now() - track.derived.enrichedAt > maxAgeMs
      );
    },

    // 候选池：最近听过/加入的曲目按新鲜度参与候选，附派生信息
    buildCandidatePool({ limit = 40, excludeIds = [] } = {}) {
      const exclude = new Set(
        [...excludeIds].map(id => normalizeTrackId(id)).filter(Boolean)
      );
      return read()
        .tracks.filter(track => !exclude.has(track.id))
        .sort(
          (a, b) => b.heard.lastAt + b.added.at - (a.heard.lastAt + a.added.at)
        )
        .slice(0, limit)
        .map(track => ({
          id: track.id,
          name: track.name,
          artists: track.artists,
          album: track.album,
          durationMs: track.durationMs,
          source: track.source,
          isLive: track.derived.isLive,
          tags: track.derived.tags,
          mood: track.derived.mood,
        }));
    },
  };
}

// 结构化预过滤：规则文本里的显式排除（现场版）直接落到派生字段上，
// LLM 不需要再"从歌名里猜"。
export function filterCandidatesByRules(candidates, rulesText = '') {
  const wantNoLive =
    /不要|少|别|不想/.test(rulesText) && /现场|live|演唱会/i.test(rulesText);
  if (!wantNoLive) return candidates;
  return candidates.filter(candidate => candidate.isLive !== true);
}

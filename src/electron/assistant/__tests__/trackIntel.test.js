import { describe, expect, it, vi } from 'vitest';

import {
  createTrackIntel,
  detectLiveFromText,
  filterCandidatesByRules,
  normalizeLearnedTrack,
  normalizeTrackId,
} from '@/electron/assistant/trackIntel';

const createMemoryStore = () => {
  const data = new Map();
  return {
    get: key => data.get(key),
    set: (key, value) => data.set(key, JSON.parse(JSON.stringify(value))),
  };
};

const track = (id, overrides = {}) => ({
  id,
  name: `song ${id}`,
  artists: 'Artist',
  album: 'Album',
  durationMs: 200000,
  ...overrides,
});

describe('track id and live detection', () => {
  it('namespaces plain ids and passes through namespaced ones', () => {
    expect(normalizeTrackId('347230')).toBe('ne:347230');
    expect(normalizeTrackId('local:abc123')).toBe('local:abc123');
    expect(normalizeTrackId('  ')).toBe('');
    expect(normalizeTrackId(42)).toBe('');
  });

  it('detects live versions from name or album', () => {
    expect(detectLiveFromText({ name: '晴天 (现场版)' })).toBe(true);
    expect(detectLiveFromText({ album: 'Unplugged Live 2019' })).toBe(true);
    expect(detectLiveFromText({ name: '晴天', album: '叶惠美' })).toBe(false);
  });
});

describe('normalizeLearnedTrack', () => {
  it('fills defaults and derives isLive heuristically', () => {
    const normalized = normalizeLearnedTrack(
      { id: 'ne:1', name: '浮夸 (Live)' },
      'ne:1'
    );
    expect(normalized).toMatchObject({
      id: 'ne:1',
      source: 'netease',
      added: { by: 'heard' },
      liked: null,
      derived: { isLive: true, enrichedAt: 0, tags: [] },
      heard: { count: 0, completedCount: 0, skipQuickCount: 0 },
    });
  });

  it('drops entries without an id and clamps oversized fields', () => {
    expect(normalizeLearnedTrack({ name: 'x' })).toBeNull();
    const huge = 'x'.repeat(500);
    const normalized = normalizeLearnedTrack({ id: 'ne:2', name: huge });
    expect(normalized.name).toHaveLength(200);
  });
});

describe('track intel store', () => {
  it('upserts without clobbering heard counters or derived data', () => {
    const intel = createTrackIntel({ store: createMemoryStore() });
    intel.upsert(track('ne:1'), { by: 'manual' });
    intel.recordHeard('ne:1', { completed: true });
    intel.setDerived('ne:1', { tags: ['slow'], mood: '伤感' });

    // 重新 upsert（如 AI 扩源再次带回同一首）
    const reupserted = intel.upsert(track('ne:1', { name: '改名了' }), {
      by: 'ai',
    });
    expect(reupserted.name).toBe('改名了');
    expect(reupserted.heard.count).toBe(1);
    expect(reupserted.derived.tags).toEqual(['slow']);
    expect(reupserted.added.by).toBe('ai');
  });

  it('recordHeard creates unknown tracks and accumulates counters', () => {
    const intel = createTrackIntel({ store: createMemoryStore() });
    const first = intel.recordHeard('347230', { skipQuick: true });
    expect(first.id).toBe('ne:347230');
    const second = intel.recordHeard('ne:347230', {
      completed: true,
      skipQuick: true,
    });
    expect(second.heard).toMatchObject({
      count: 2,
      completedCount: 1,
      skipQuickCount: 2,
    });
  });

  it('setLiked and needsEnrichment follow enrichment state', () => {
    vi.useFakeTimers();
    try {
      const intel = createTrackIntel({ store: createMemoryStore() });
      intel.upsert(track('ne:9'), { by: 'manual' });
      expect(intel.needsEnrichment('ne:9')).toBe(true);

      intel.setDerived('ne:9', { tags: ['pop'] });
      expect(intel.needsEnrichment('ne:9')).toBe(false);

      vi.advanceTimersByTime(8 * 24 * 3600_000);
      expect(intel.needsEnrichment('ne:9')).toBe(true);

      expect(intel.setLiked('ne:9', true).liked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('buildCandidatePool sorts by freshness and excludes given ids', () => {
    vi.useFakeTimers();
    try {
      const intel = createTrackIntel({ store: createMemoryStore() });
      intel.upsert(track('ne:old'), { by: 'manual' });
      vi.advanceTimersByTime(1000);
      intel.upsert(track('ne:new'), { by: 'ai' });

      const pool = intel.buildCandidatePool({ excludeIds: ['ne:old'] });
      expect(pool.map(item => item.id)).toEqual(['ne:new']);
      expect(pool[0]).toMatchObject({ isLive: false, tags: [] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives a reload from the injected store', () => {
    const memory = createMemoryStore();
    const first = createTrackIntel({ store: memory });
    first.recordHeard('ne:1', { completed: true });
    const reloaded = createTrackIntel({ store: memory });
    expect(reloaded.get('ne:1').heard.count).toBe(1);
  });
});

describe('filterCandidatesByRules', () => {
  const candidates = [
    { id: 'ne:1', name: '晴天 (现场版)', isLive: true },
    { id: 'ne:2', name: '晴天', isLive: false },
    { id: 'ne:3', name: '未知', isLive: null },
  ];

  it('hard-filters live tracks when the rule text says so', () => {
    const filtered = filterCandidatesByRules(candidates, '长期：不要现场版');
    expect(filtered.map(c => c.id)).toEqual(['ne:2', 'ne:3']);
  });

  it('leaves candidates untouched when no live-related rule exists', () => {
    expect(filterCandidatesByRules(candidates, '今天别伤感')).toHaveLength(3);
    expect(filterCandidatesByRules(candidates, '多来点现场版')).toHaveLength(3);
  });
});

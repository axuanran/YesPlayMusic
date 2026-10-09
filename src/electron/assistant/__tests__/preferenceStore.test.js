import { describe, expect, it, vi } from 'vitest';

import {
  createPreferenceStore,
  normalizeAssistantState,
  normalizePreferenceRule,
} from '@/electron/assistant/preferenceStore';

const createMemoryStore = () => {
  const data = new Map();
  return {
    get: key => data.get(key),
    set: (key, value) => data.set(key, JSON.parse(JSON.stringify(value))),
  };
};

describe('preference store', () => {
  it('normalizes a full assistant state', () => {
    const state = normalizeAssistantState({
      preferences: {
        longTerm: [{ rule: '不要现场版', source: 'explicit', confidence: 2 }],
        temporary: [{ rule: '最近听腻了', expiresAt: 123 }],
        session: [{ rule: '今天别伤感' }],
      },
      feedback: [{ type: 'text', text: '少点慢歌', trackId: 7, at: 5 }],
    });

    expect(state.preferences.longTerm[0]).toMatchObject({
      rule: '不要现场版',
      source: 'explicit',
      confidence: 1, // clamped
      scope: 'global',
    });
    expect(state.preferences.temporary[0].expiresAt).toBe(123);
    expect(state.preferences.session[0].rule).toBe('今天别伤感');
    expect(state.feedback[0]).toMatchObject({ type: 'text', trackId: 7 });
  });

  it('drops malformed rules and feedback', () => {
    const state = normalizeAssistantState({
      preferences: { longTerm: [{ rule: '  ' }, 'garbage', { rule: 42 }] },
      feedback: [{ type: 'explode' }, 'garbage', { type: 'skip' }],
    });
    expect(state.preferences.longTerm).toEqual([]);
    expect(state.feedback).toHaveLength(2);
    expect(state.feedback.map(entry => entry.type)).toEqual(['text', 'skip']);
  });

  it('assigns stable ids to normalized rules', () => {
    const a = normalizePreferenceRule({ rule: 'x' }, 'long');
    const b = normalizePreferenceRule({ rule: 'y' }, 'long');
    expect(a.id).not.toBe(b.id);
    const kept = normalizePreferenceRule({ id: 'my-rule', rule: 'x' }, 'long');
    expect(kept.id).toBe('my-rule');
  });

  it('persists, layers, and dedupes rules', () => {
    const store = createPreferenceStore({ store: createMemoryStore() });

    const first = store.addRule('longTerm', {
      rule: '不要现场版',
      source: 'explicit',
    });
    const duplicate = store.addRule('longTerm', {
      rule: '不要现场版',
      confidence: 0.9,
    });
    store.addRule('session', { rule: '今天别伤感' });
    store.addRule('temporary', {
      rule: '最近听腻了',
      expiresAt: Date.now() + 1000,
    });

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.confidence).toBeCloseTo(1);

    const snapshot = store.get();
    expect(snapshot.preferences.longTerm).toHaveLength(1);
    expect(snapshot.preferences.session).toHaveLength(1);
    expect(snapshot.preferences.temporary).toHaveLength(1);

    expect(store.removeRule('longTerm', first.id)).toBe(true);
    expect(store.removeRule('longTerm', first.id)).toBe(false);
    expect(store.get().preferences.longTerm).toHaveLength(0);
  });

  it('rejects unknown layers and empty rules', () => {
    const store = createPreferenceStore({ store: createMemoryStore() });
    expect(store.addRule('forever', { rule: 'x' })).toBeNull();
    expect(store.addRule('longTerm', { rule: '   ' })).toBeNull();
    expect(store.get().preferences.longTerm).toHaveLength(0);
  });

  it('filters expired temporary rules from get()', () => {
    const store = createPreferenceStore({ store: createMemoryStore() });
    store.addRule('temporary', {
      rule: '上周的不算',
      expiresAt: Date.now() - 10,
    });
    store.addRule('temporary', {
      rule: '这周的有效',
      expiresAt: Date.now() + 60_000,
    });
    const temporary = store.get().preferences.temporary;
    expect(temporary.map(rule => rule.rule)).toEqual(['这周的有效']);
  });

  it('records feedback and lists it with a since cursor', () => {
    const store = createPreferenceStore({ store: createMemoryStore() });
    store.recordFeedback({ type: 'text', text: '少点慢歌', at: 1 });
    store.recordFeedback({ type: 'skip', trackId: 42, at: 2 });
    store.recordFeedback({ type: 'like', trackId: 43, at: 3 });

    const all = store.listFeedback({ since: 0, limit: 10 });
    expect(all.map(entry => entry.type)).toEqual(['text', 'skip', 'like']);

    const later = store.listFeedback({ since: 1, limit: 10 });
    expect(later.map(entry => entry.type)).toEqual(['skip', 'like']);
  });

  it('caps the feedback ring buffer', () => {
    const memory = createMemoryStore();
    const store = createPreferenceStore({ store: memory });
    for (let index = 0; index < 230; index++) {
      store.recordFeedback({ type: 'skip', trackId: index });
    }
    const entries = store.listFeedback({ since: 0, limit: 300 });
    expect(entries).toHaveLength(200);
    expect(entries[0].trackId).toBe(30);
  });

  it('survives a reload from the injected store', () => {
    const memory = createMemoryStore();
    const first = createPreferenceStore({ store: memory });
    first.addRule('longTerm', { rule: '不要现场版', source: 'explicit' });

    const reloaded = createPreferenceStore({ store: memory });
    expect(reloaded.get().preferences.longTerm[0].rule).toBe('不要现场版');
  });
});

describe('preference store without storage', () => {
  it('degrades to in-memory behavior', () => {
    const store = createPreferenceStore({});
    const rule = store.addRule('session', { rule: 'x' });
    expect(rule.rule).toBe('x');
    expect(() => store.recordFeedback({ type: 'skip' })).not.toThrow();
    expect(
      vi.isMockFunction(store.get) || typeof store.get === 'function'
    ).toBe(true);
  });
});

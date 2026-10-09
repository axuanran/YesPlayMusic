import { describe, expect, it, vi } from 'vitest';

import {
  createRadioEngine,
  REFILL_BATCH_SIZE,
} from '@/electron/assistant/radioEngine';

const candidate = (id, name = `song ${id}`) => ({
  id,
  name,
  artists: 'Artist',
  album: 'Album',
});

const createDeps = (overrides = {}) => {
  const deps = {
    candidates: Array.from({ length: 12 }, (_, index) => candidate(index + 1)),
    enqueued: [],
    priority: [],
    preferences: { longTerm: [], temporary: [], session: [] },
    llmText: null,
    ...overrides,
  };
  const llmChatMock =
    deps.llmText === null ? undefined : vi.fn(async () => deps.llmText);
  return {
    deps,
    llmChatMock,
    engine: createRadioEngine({
      getCandidates: vi.fn(async () => deps.candidates),
      enqueue: vi.fn(ids => {
        deps.enqueued.push(...ids);
        deps.priority.push(...ids);
      }),
      getQueue: () => ({ priority: deps.priority }),
      llmChat: llmChatMock,
      getPreferences: vi.fn(async () => deps.preferences),
      onError: vi.fn(),
      autoRefillIntervalMs: 0,
    }),
  };
};

describe('radio engine', () => {
  it('falls back to ordered selection without an LLM', async () => {
    const { engine, deps } = createDeps();

    const status = await engine.start();

    expect(status.active).toBe(true);
    expect(deps.enqueued).toEqual(
      Array.from({ length: REFILL_BATCH_SIZE }, (_, index) => index + 1)
    );
  });

  it('uses LLM picks when they validate against the candidates', async () => {
    const { engine, deps } = createDeps({
      llmText: JSON.stringify({
        picks: [
          { id: 5, reason: '延续现在的节奏' },
          { id: 9, reason: '同流派但没听过' },
        ],
      }),
    });

    await engine.start();

    expect(deps.enqueued.slice(0, 2)).toEqual([5, 9]);
    expect(deps.enqueued).toHaveLength(REFILL_BATCH_SIZE);
    const status = engine.status();
    expect(status.lastPicks.slice(0, 2)).toEqual([
      { id: 5, reason: '延续现在的节奏', at: expect.any(Number) },
      { id: 9, reason: '同流派但没听过', at: expect.any(Number) },
    ]);
  });

  it('rejects LLM picks that are not real candidates and falls back', async () => {
    const { engine, deps } = createDeps({
      llmText: JSON.stringify({
        picks: [
          { id: 999, reason: '编造的 id' },
          { id: 3, reason: '真实候选' },
          { id: 3, reason: '重复' },
        ],
      }),
    });

    await engine.start();

    // only the valid, deduped pick survives, then fallback tops up the batch
    expect(deps.enqueued[0]).toBe(3);
    expect(new Set(deps.enqueued).size).toBe(deps.enqueued.length);
    expect(deps.enqueued).toContain(3);
    expect(deps.enqueued.length).toBe(REFILL_BATCH_SIZE);
  });

  it('falls back when the LLM output is not parseable', async () => {
    const { engine, deps } = createDeps({ llmText: '抱歉，我无法选择' });

    await engine.start();

    expect(deps.enqueued).toEqual(
      Array.from({ length: REFILL_BATCH_SIZE }, (_, index) => index + 1)
    );
  });

  it('excludes session history and the current priority queue from candidates', async () => {
    const { engine, deps } = createDeps();
    await engine.start();
    deps.priority.length = 0; // simulate the queue being consumed

    await engine.maybeRefill({ force: true });

    const firstBatch = deps.enqueued.slice(0, REFILL_BATCH_SIZE);
    const secondBatch = deps.enqueued.slice(REFILL_BATCH_SIZE);
    for (const id of firstBatch) {
      expect(secondBatch).not.toContain(id);
    }
  });

  it('does not refill above the threshold unless forced', async () => {
    const { engine, deps } = createDeps();
    await engine.start();
    const before = deps.enqueued.length;

    // priority queue still holds the freshly enqueued batch
    expect(await engine.maybeRefill()).toBe(false);
    expect(deps.enqueued.length).toBe(before);

    deps.priority.length = 1; // drop below the threshold
    expect(await engine.maybeRefill()).toBe(true);
    expect(deps.enqueued.length).toBeGreaterThan(before);
  });

  it('stops refilling after stop()', async () => {
    const { engine, deps } = createDeps();
    await engine.start();
    const before = deps.enqueued.length;

    const status = engine.stop();
    expect(status.active).toBe(false);

    deps.priority.length = 0;
    expect(await engine.maybeRefill({ force: true })).toBe(false);
    expect(deps.enqueued.length).toBe(before);
  });

  it('passes active preference rules to the LLM prompt', async () => {
    const { engine, llmChatMock } = createDeps({
      llmText: '{"picks":[{"id":1,"reason":"x"}]}',
      preferences: {
        longTerm: [{ rule: '不要现场版' }],
        temporary: [
          { rule: '最近听腻了', expiresAt: Date.now() + 60_000 },
          { rule: '已过期', expiresAt: Date.now() - 60_000 },
        ],
        session: [{ rule: '今天别伤感' }],
      },
    });

    await engine.start();

    const prompt = llmChatMock.mock.calls[0][0].prompt;
    expect(prompt).toContain('长期：不要现场版');
    expect(prompt).toContain('暂时：最近听腻了');
    expect(prompt).toContain('本次：今天别伤感');
    expect(prompt).not.toContain('已过期');
    expect(prompt).toContain('#1 Artist - song 1');
  });

  it('reports errors through onError instead of throwing', async () => {
    const errors = [];
    const engine = createRadioEngine({
      getCandidates: vi.fn(async () => {
        throw new Error('api down');
      }),
      enqueue: vi.fn(),
      getQueue: () => ({ priority: [] }),
      onError: (phase, error) => errors.push([phase, error.message]),
    });

    await engine.start();
    expect(errors).toEqual([['candidates', 'api down']]);
    expect(engine.status().active).toBe(true);
  });

  it('parses fenced and unfenced LLM JSON', () => {
    const { engine } = createDeps();
    const candidates = [candidate(1), candidate(2)];
    expect(
      engine._parsePicksForTests(
        '```json\n{"picks":[{"id":2,"reason":"b"}]}\n```',
        candidates
      )
    ).toEqual([{ id: 2, reason: 'b' }]);
    expect(
      engine._parsePicksForTests(
        '{"picks":[{"id":"1","reason":"a"}]}',
        candidates
      )
    ).toEqual([{ id: 1, reason: 'a' }]);
    expect(engine._parsePicksForTests('not json', candidates)).toEqual([]);
  });
});

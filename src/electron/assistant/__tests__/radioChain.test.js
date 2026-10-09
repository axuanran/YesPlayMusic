import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/electron/ipcRenderer', () => ({
  handleMprisCommand: vi.fn(),
}));

import { createControlHandlers } from '@/electron/controlHandlers';
import { createRadioEngine } from '@/electron/assistant/radioEngine';
import { createPreferenceStore } from '@/electron/assistant/preferenceStore';

// End-to-end rehearsal of the exact MCP chain the live test drives:
// radio.start → feedback(text) → preferences.get → radio.status.
// The control handlers, radio engine and preference store are the real
// modules; only the network edges (candidates API, LLM endpoint) and the
// preload bridge are replaced with in-memory fakes.

const createMemoryStore = () => {
  const data = new Map();
  return {
    get: key => data.get(key),
    set: (key, value) => data.set(key, JSON.parse(JSON.stringify(value))),
  };
};

describe('assistant chain rehearsal', () => {
  let assistantApi;
  let handlers;
  let enqueued;

  beforeEach(() => {
    enqueued = [];
    const preferenceStore = createPreferenceStore({
      store: createMemoryStore(),
    });

    // The preload bridge the handlers call through, backed by the real
    // preference store; the LLM output is scripted per test via __llmOutput.
    assistantApi = {
      __llmOutput: null,
      getPreferences: () => Promise.resolve(preferenceStore.get()),
      addRule: payload =>
        Promise.resolve(preferenceStore.addRule(payload.layer, payload.rule)),
      removeRule: payload =>
        Promise.resolve(preferenceStore.removeRule(payload.layer, payload.id)),
      recordFeedback: payload =>
        Promise.resolve(preferenceStore.recordFeedback(payload)),
      listFeedback: params =>
        Promise.resolve(preferenceStore.listFeedback(params)),
      llmChat: () => Promise.resolve(assistantApi.__llmOutput),
    };

    const radio = createRadioEngine({
      getCandidates: async () => [
        { id: 101, name: '晴天', artists: '周杰伦', album: '叶惠美' },
        { id: 102, name: '七里香', artists: '周杰伦', album: '七里香' },
        { id: 103, name: '红豆', artists: '王菲', album: '唱游' },
        { id: 104, name: '梦中人', artists: '王菲', album: '重庆森林' },
        { id: 105, name: '浮夸', artists: '陈奕迅', album: 'U87' },
        { id: 106, name: '好久不见', artists: '陈奕迅', album: '认了吧' },
      ],
      enqueue: ids => enqueued.push(...ids),
      getQueue: () => ({ priority: [...enqueued] }),
      llmChat: args => assistantApi.llmChat(args),
      getPreferences: () => assistantApi.getPreferences(),
      autoRefillIntervalMs: 0,
    });

    const player = {
      currentTrack: { id: 101, name: '晴天', ar: [{ name: '周杰伦' }] },
      playing: false,
      progress: 0,
      volume: 0.5,
      repeatMode: 'off',
      shuffle: false,
      isPersonalFM: false,
      playlistSource: null,
      list: [],
      playNextList: [],
      addTrackToPlayNext: id => enqueued.push(id),
    };
    const store = { dispatch: vi.fn(), state: { liked: { songs: [] } } };

    handlers = createControlHandlers({ store, player, radio });
    vi.stubGlobal('window', { electronAPI: { assistant: assistantApi } });
  });

  it('drives start → feedback → preferences → status through the real handlers', async () => {
    // 1) start the radio (no LLM configured → deterministic fallback picks)
    const started = await handlers['radio.start']();
    expect(started.active).toBe(true);
    expect(enqueued.length).toBeGreaterThan(0);

    // 2) free-form feedback; LLM layers it into a temporary rule
    assistantApi.__llmOutput =
      '{"layer":"temporary","rule":"这首最近听腻了","confidence":0.8,"expiresInHours":72}';
    const ack = await handlers.feedback({
      text: '这首最近听腻了',
      trackId: 101,
    });
    expect(ack.accepted).toBe(true);
    // layering is fire-and-forget; give the microtask queue a beat
    await new Promise(resolve => setTimeout(resolve, 0));

    // 3) preferences now carry the layered rule
    const prefs = await handlers['preferences.get']();
    expect(prefs.preferences.temporary).toHaveLength(1);
    expect(prefs.preferences.temporary[0]).toMatchObject({
      rule: '这首最近听腻了',
      source: 'explicit',
    });
    expect(prefs.feedback.map(entry => entry.type)).toContain('text');

    // 4) status reflects the live session
    const status = await handlers['radio.status']();
    expect(status.active).toBe(true);
    expect(status.enqueuedTotal).toBe(enqueued.length);
    expect(Array.isArray(status.lastPicks)).toBe(true);
  });

  it('keeps the chain working without any LLM (rule-based degradation)', async () => {
    const started = await handlers['radio.start']();
    expect(started.active).toBe(true);

    await handlers.feedback({ type: 'skip', trackId: 101 });
    const prefs = await handlers['preferences.get']();
    expect(prefs.preferences.temporary).toHaveLength(0);
    expect(prefs.feedback).toHaveLength(1);

    const stopped = await handlers['radio.stop']();
    expect(stopped.active).toBe(false);
  });
});

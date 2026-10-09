import { describe, expect, it, vi } from 'vitest';

import { interpretFeedbackText } from '@/electron/assistant/feedbackInterpreter';

const createAssistant = ({ output } = {}) => {
  const calls = { llmChat: [], addRule: [] };
  return {
    calls,
    api: {
      llmChat: vi.fn(async payload => {
        calls.llmChat.push(payload);
        return output;
      }),
      getPreferences: vi.fn(async () => ({
        preferences: {
          longTerm: [{ rule: '不要现场版' }],
          temporary: [],
          session: [],
        },
      })),
      addRule: vi.fn(async payload => {
        calls.addRule.push(payload);
        return { ...payload, id: 'r1' };
      }),
    },
  };
};

describe('feedback interpreter', () => {
  it('layers a temporary rule with expiry through the LLM', async () => {
    const { api, calls } = createAssistant({
      output:
        '{"layer":"temporary","rule":"这首歌最近听腻了","confidence":0.8,"expiresInHours":72}',
    });

    const stored = await interpretFeedbackText('这首歌最近听腻了', {
      assistant: api,
      now: () => 1_000_000,
    });

    expect(stored).toMatchObject({ id: 'r1' });
    expect(calls.addRule[0]).toEqual({
      layer: 'temporary',
      rule: expect.objectContaining({
        rule: '这首歌最近听腻了',
        confidence: 0.8,
        expiresAt: 1_000_000 + 72 * 3600_000,
        source: 'explicit',
      }),
    });
    // existing long-term rules go into the prompt for dedupe context
    expect(calls.llmChat[0].prompt).toContain('长期:不要现场版');
    expect(calls.llmChat[0].prompt).toContain('用户反馈："这首歌最近听腻了"');
  });

  it('defaults unknown layers to session and clamps confidence', async () => {
    const { api, calls } = createAssistant({
      output: '{"layer":"forever","rule":"x","confidence":9}',
    });

    await interpretFeedbackText('x', { assistant: api });

    expect(calls.addRule[0].layer).toBe('session');
    expect(calls.addRule[0].rule.confidence).toBe(1);
    expect(calls.addRule[0].rule.expiresAt).toBeUndefined();
  });

  it('returns null for empty text, missing bridge and unparseable output', async () => {
    const { api, calls } = createAssistant({ output: 'not json' });
    expect(await interpretFeedbackText('   ', { assistant: api })).toBeNull();
    expect(await interpretFeedbackText('x', { assistant: null })).toBeNull();
    expect(await interpretFeedbackText('x', { assistant: api })).toBeNull();
    expect(calls.addRule).toHaveLength(0);
  });

  it('never throws when the bridge rejects', async () => {
    const assistant = {
      llmChat: vi.fn(async () => {
        throw new Error('network down');
      }),
      getPreferences: async () => null,
      addRule: vi.fn(),
    };
    expect(await interpretFeedbackText('x', { assistant })).toBeNull();
    expect(assistant.addRule).not.toHaveBeenCalled();
  });
});

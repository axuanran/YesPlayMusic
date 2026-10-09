import { describe, expect, it, vi } from 'vitest';

import {
  buildEnrichmentPrompt,
  maybeEnrichTrack,
  namespacedTrackId,
  parseEnrichmentOutput,
} from '@/electron/assistant/enrichment';

describe('enrichment helpers', () => {
  it('builds namespaced ids from source flags', () => {
    expect(namespacedTrackId({ id: 347230 })).toBe('ne:347230');
    expect(namespacedTrackId({ id: 347230, local: true })).toBe('local:347230');
    expect(namespacedTrackId({ id: 347230, streaming: true })).toBe(
      'emby:347230'
    );
    expect(namespacedTrackId({ id: 'ne:1' })).toBe('ne:1');
    expect(namespacedTrackId({})).toBe('');
  });

  it('builds a prompt with metadata and lyric lines', () => {
    const prompt = buildEnrichmentPrompt({
      track: { name: '晴天', artists: '周杰伦', album: '叶惠美' },
      lyricLines: ['故事的小黄花', '从出生那年就飘着'],
    });
    expect(prompt).toContain('歌名：晴天');
    expect(prompt).toContain('歌词片段：\n故事的小黄花');
  });

  it('parses enrichment JSON and rejects unusable output', () => {
    expect(
      parseEnrichmentOutput(
        '{"tags":["mandopop","melancholy"],"mood":"青涩","isLive":false}'
      )
    ).toEqual({
      tags: ['mandopop', 'melancholy'],
      mood: '青涩',
      isLive: false,
    });
    expect(parseEnrichmentOutput('{"tags":[]}')).toBeNull();
    expect(parseEnrichmentOutput('not json')).toBeNull();
  });
});

describe('maybeEnrichTrack', () => {
  const createBridge = output => {
    const calls = { llmChat: [], setDerived: [] };
    return {
      calls,
      api: {
        __output: output,
        llmChat: vi.fn(async payload => {
          calls.llmChat.push(payload);
          return output;
        }),
        trackNeedsEnrichment: vi.fn(async () => true),
        trackSetDerived: vi.fn(async payload => {
          calls.setDerived.push(payload);
          return { id: payload.id, ...payload.derived };
        }),
      },
    };
  };

  it('derives structured fields and stores them through the bridge', async () => {
    const { api, calls } = createBridge(
      '{"tags":["mandopop","ballad"],"mood":"抒情","isLive":false}'
    );
    const track = { id: 347230, name: '晴天', artists: '周杰伦' };

    const stored = await maybeEnrichTrack({ assistant: api, track });

    expect(stored).toMatchObject({ id: 'ne:347230' });
    expect(calls.setDerived[0]).toEqual({
      id: 'ne:347230',
      derived: { tags: ['mandopop', 'ballad'], mood: '抒情', isLive: false },
    });
  });

  it('skips enrichment when recently enriched or output is unusable', async () => {
    const { api, calls } = createBridge('not json');
    api.trackNeedsEnrichment = vi.fn(async () => false);
    expect(
      await maybeEnrichTrack({ assistant: api, track: { id: 1 } })
    ).toBeNull();
    expect(calls.llmChat).toHaveLength(0);

    api.trackNeedsEnrichment = vi.fn(async () => true);
    expect(
      await maybeEnrichTrack({ assistant: api, track: { id: 1 } })
    ).toBeNull();
    expect(calls.setDerived).toHaveLength(0);
  });

  it('never throws when the bridge fails', async () => {
    const assistant = {
      llmChat: vi.fn(async () => {
        throw new Error('network down');
      }),
      trackNeedsEnrichment: vi.fn(async () => true),
      trackSetDerived: vi.fn(),
    };
    expect(await maybeEnrichTrack({ assistant, track: { id: 1 } })).toBeNull();
    expect(assistant.trackSetDerived).not.toHaveBeenCalled();
  });
});

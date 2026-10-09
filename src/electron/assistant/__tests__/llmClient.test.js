import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLlmClient,
  normalizeLlmConfig,
} from '@/electron/assistant/llmClient';

const okResponse = text => ({
  ok: true,
  json: () => Promise.resolve({ choices: [{ message: { content: text } }] }),
});

describe('llm client config', () => {
  it('normalizes defaults and trims the base url', () => {
    expect(normalizeLlmConfig()).toEqual({
      enabled: false,
      baseUrl: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      timeoutMs: 30000,
    });
    const cfg = normalizeLlmConfig({
      enabled: true,
      baseUrl: 'http://localhost:11434/v1/',
      model: '  qwen3  ',
      timeoutMs: 5,
    });
    expect(cfg).toMatchObject({
      enabled: true,
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3',
      timeoutMs: 1000, // clamped
    });
  });
});

describe('llm client chat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when disabled or unconfigured', async () => {
    const fetchImpl = vi.fn();
    expect(
      await createLlmClient({ config: {}, fetchImpl }).chat({ prompt: 'hi' })
    ).toBeNull();
    expect(
      await createLlmClient({
        config: { enabled: true, baseUrl: 'http://x', apiKey: '' },
        fetchImpl,
      }).chat({ prompt: 'hi' })
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts an OpenAI-compatible chat completion and returns the text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse(' 好的 '));
    const client = createLlmClient({
      config: {
        enabled: true,
        baseUrl: 'http://127.0.0.1:11434/v1',
        apiKey: 'sk-test',
        model: 'qwen3',
      },
      fetchImpl,
    });

    const text = await client.chat({ system: 'sys', prompt: 'prompt' });

    expect(text).toBe('好的');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:11434/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
        }),
      })
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('qwen3');
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'prompt' },
    ]);
  });

  it('returns null on http errors, malformed payloads and rejections', async () => {
    const failing = createLlmClient({
      config: { enabled: true, baseUrl: 'http://x', apiKey: 'k' },
      fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    });
    expect(await failing.chat({ prompt: 'x' })).toBeNull();

    const malformed = createLlmClient({
      config: { enabled: true, baseUrl: 'http://x', apiKey: 'k' },
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: () => null }),
    });
    expect(await malformed.chat({ prompt: 'x' })).toBeNull();

    const rejected = createLlmClient({
      config: { enabled: true, baseUrl: 'http://x', apiKey: 'k' },
      fetchImpl: vi.fn().mockRejectedValue(new Error('network down')),
    });
    expect(await rejected.chat({ prompt: 'x' })).toBeNull();
  });

  it('aborts the request when the timeout fires', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url, options) =>
        new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(new Error('aborted'))
          );
          // never resolves on its own
          void resolve;
        })
    );
    const client = createLlmClient({
      config: {
        enabled: true,
        baseUrl: 'http://x',
        apiKey: 'k',
        timeoutMs: 1000,
      },
      fetchImpl,
    });
    const pending = client.chat({ prompt: 'x' });
    await vi.advanceTimersByTimeAsync(1100);
    await expect(pending).resolves.toBeNull();
  });

  it('rejects empty prompts and clamps maxTokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse('ok'));
    const client = createLlmClient({
      config: { enabled: true, baseUrl: 'http://x', apiKey: 'k' },
      fetchImpl,
    });
    expect(await client.chat({ prompt: '   ' })).toBeNull();
    await client.chat({ prompt: 'x', maxTokens: 999999 });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(4096);
  });
});

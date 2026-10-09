// LLM bridge for the AI music assistant. Calls are proxied through the main
// process (Node fetch, no CORS) so any OpenAI-compatible endpoint works,
// including local servers (ollama, LM Studio, ...). The client degrades to
// null on every failure: the assistant features must stay optional.

export const normalizeLlmConfig = (raw = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: source.enabled === true,
    baseUrl:
      typeof source.baseUrl === 'string'
        ? source.baseUrl.trim().replace(/\/+$/, '')
        : '',
    apiKey: typeof source.apiKey === 'string' ? source.apiKey : '',
    model:
      typeof source.model === 'string' && source.model.trim()
        ? source.model.trim()
        : 'gpt-4o-mini',
    timeoutMs: Number.isFinite(source.timeoutMs)
      ? Math.min(Math.max(source.timeoutMs, 1000), 120000)
      : 30000,
  };
};

export function createLlmClient({ config, fetchImpl } = {}) {
  const cfg = normalizeLlmConfig(config);
  const fetchFn = fetchImpl ?? globalThis.fetch;

  const available = () =>
    cfg.enabled &&
    Boolean(cfg.baseUrl) &&
    Boolean(cfg.apiKey) &&
    typeof fetchFn === 'function';

  // Returns the assistant text, or null when unavailable / failed. Never
  // throws: callers treat null as "fall back to rule-based behavior".
  const chat = async ({ system, prompt, maxTokens = 768 } = {}) => {
    if (!available()) return null;
    if (typeof prompt !== 'string' || !prompt.trim()) return null;
    if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens)) {
      maxTokens = 768;
    }
    maxTokens = Math.min(Math.max(Math.floor(maxTokens), 1), 4096);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const response = await fetchFn(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            ...(typeof system === 'string' && system.trim()
              ? [{ role: 'system', content: system }]
              : []),
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.3,
        }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      const text = data?.choices?.[0]?.message?.content;
      return typeof text === 'string' && text.trim() ? text.trim() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  return { chat, available, config: cfg };
}

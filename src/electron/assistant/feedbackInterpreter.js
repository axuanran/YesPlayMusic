// Shared "自然语言反馈 → 三层偏好" interpreter. Used by the control plane
// (MCP feedback) and by the in-app quick feedback UI so both go through the
// exact same layering logic. The LLM only proposes a structured rule; the
// program validates the shape and stores it through the preference bridge.
// Every failure mode resolves to null: unparseable output never reaches the
// store.

import { extractJsonObject } from './radioEngine.js';

export const INTERPRET_LAYERS = ['session', 'temporary', 'longTerm'];

const buildPrompt = ({ text, existing }) =>
  [
    '三层定义：session=只影响当前这次听歌；temporary=暂时偏好，带恢复预期；longTerm=用户明确表达的长期口味。',
    '只输出 JSON：{"layer":"session|temporary|longTerm","rule":"不超过30字的可执行规则","confidence":0到1,"expiresInHours":数字或null}（temporary 才给 expiresInHours）。',
    existing ? `已有规则：\n${existing}` : '',
    `用户反馈："${text}"`,
  ]
    .filter(Boolean)
    .join('\n\n');

// Returns the stored rule object on success, null otherwise.
export async function interpretFeedbackText(
  text,
  { assistant, now = Date.now } = {}
) {
  try {
    if (typeof text !== 'string' || !text.trim()) return null;
    if (typeof assistant?.llmChat !== 'function') return null;
    const prefs = (await assistant.getPreferences?.()) ?? null;
    const existing = [
      ...(prefs?.preferences?.longTerm ?? []).map(rule => `长期:${rule.rule}`),
      ...(prefs?.preferences?.temporary ?? []).map(rule => `暂时:${rule.rule}`),
      ...(prefs?.preferences?.session ?? []).map(rule => `本次:${rule.rule}`),
    ].join('\n');
    const output = await assistant.llmChat({
      system:
        '你是 XuMP 音乐偏好的理解器。把用户的自然语言反馈归类为一条可执行的偏好规则。',
      prompt: buildPrompt({ text: text.trim().slice(0, 512), existing }),
      maxTokens: 300,
    });
    const parsed = extractJsonObject(output);
    if (!parsed || typeof parsed.rule !== 'string' || !parsed.rule.trim()) {
      return null;
    }
    const layer = INTERPRET_LAYERS.includes(parsed.layer)
      ? parsed.layer
      : 'session';
    const rule = {
      rule: parsed.rule.trim().slice(0, 280),
      source: 'explicit',
    };
    if (Number.isFinite(parsed.confidence)) {
      rule.confidence = Math.min(1, Math.max(0, parsed.confidence));
    }
    if (layer === 'temporary' && Number.isFinite(parsed.expiresInHours)) {
      rule.expiresAt = now() + parsed.expiresInHours * 3600_000;
    }
    return await assistant.addRule({ layer, rule });
  } catch {
    return null;
  }
}

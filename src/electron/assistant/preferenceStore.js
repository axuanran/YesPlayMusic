// Preference + feedback store for the AI music assistant ("可调教的私人
// 电台"). Persisted in the main process so the data survives regardless of
// which renderer origin is active, and so MCP clients and the UI share one
// source of truth. Storage is injected (electron-store in production) which
// keeps the module fully testable.
//
// Preference layers:
// - longTerm: 用户确认过的长期规则，可见、可改、可删
// - temporary: 带过期时间的降权规则（"最近听腻了"）
// - session: 只影响当前听歌会话的一次性需求

export const PREFERENCE_LAYERS = ['longTerm', 'temporary', 'session'];

export const FEEDBACK_TYPES = new Set([
  'text', // 自然语言反馈（由 LLM 在后续管线中分层）
  'skip',
  'skip_quick', // 播放后 30 秒内切走（弱信号）
  'complete', // 自然播放完成
  'like',
  'unlike',
]);

const MAX_FEEDBACK_ENTRIES = 200;
const DEFAULT_RULE_SCOPE = 'global';
const DEFAULT_RULE_CONFIDENCE = 0.6;

let ruleSeq = 0;

const now = () => Date.now();

const isRecord = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizePreferenceRule(raw = {}, fallbackId = 'rule') {
  const rule = isRecord(raw) ? raw : {};
  return {
    id:
      typeof rule.id === 'string' && rule.id
        ? rule.id.slice(0, 64)
        : `${fallbackId}-${++ruleSeq}`,
    // 规则的可读描述，例如 "不要现场版"、"专注模式下倾向纯音乐"
    rule:
      typeof rule.rule === 'string' && rule.rule.trim()
        ? rule.rule.trim().slice(0, 280)
        : '',
    source: rule.source === 'inferred' ? 'inferred' : 'explicit',
    scope:
      typeof rule.scope === 'string' && rule.scope.trim()
        ? rule.scope.trim().slice(0, 64)
        : DEFAULT_RULE_SCOPE,
    confidence: Number.isFinite(rule.confidence)
      ? Math.min(1, Math.max(0, rule.confidence))
      : DEFAULT_RULE_CONFIDENCE,
    createdAt: Number.isFinite(rule.createdAt) ? rule.createdAt : now(),
    updatedAt: Number.isFinite(rule.updatedAt) ? rule.updatedAt : now(),
    ...(Number.isFinite(rule.expiresAt) ? { expiresAt: rule.expiresAt } : {}),
  };
}

export function normalizeAssistantState(raw = {}) {
  const source = isRecord(raw) ? raw : {};
  const preferences = isRecord(source.preferences) ? source.preferences : {};
  const feedback = Array.isArray(source.feedback) ? source.feedback : [];
  return {
    preferences: {
      longTerm: (Array.isArray(preferences.longTerm)
        ? preferences.longTerm
        : []
      )
        .map(rule => normalizePreferenceRule(rule, 'long'))
        .filter(rule => rule.rule),
      temporary: (Array.isArray(preferences.temporary)
        ? preferences.temporary
        : []
      )
        .map(rule => normalizePreferenceRule(rule, 'temp'))
        .filter(rule => rule.rule),
      session: (Array.isArray(preferences.session) ? preferences.session : [])
        .map(rule => normalizePreferenceRule(rule, 'session'))
        .filter(rule => rule.rule),
    },
    feedback: feedback
      .filter(isRecord)
      .slice(-MAX_FEEDBACK_ENTRIES)
      .map(entry => ({
        type: FEEDBACK_TYPES.has(entry.type) ? entry.type : 'text',
        text:
          typeof entry.text === 'string' ? entry.text.slice(0, 512) : undefined,
        trackId: Number.isInteger(entry.trackId) ? entry.trackId : undefined,
        at: Number.isFinite(entry.at) ? entry.at : now(),
      })),
  };
}

const emptyState = () => normalizeAssistantState({});

export function createPreferenceStore({ store, key = 'assistant' } = {}) {
  const read = () => normalizeAssistantState(store?.get?.(key) || emptyState());
  const write = state => {
    store?.set?.(key, state);
    return state;
  };

  return {
    get() {
      const state = read();
      return {
        ...state,
        // 过期的临时规则不下发，也不立即删除（下次写入时自然清理）
        preferences: {
          ...state.preferences,
          temporary: state.preferences.temporary.filter(
            rule => !Number.isFinite(rule.expiresAt) || rule.expiresAt > now()
          ),
        },
      };
    },

    // 追加一条规则到指定层；同层相同描述的规则去重并提升置信度
    addRule(layer, rawRule = {}) {
      if (!PREFERENCE_LAYERS.includes(layer)) return null;
      const next = read();
      const rule = normalizePreferenceRule(rawRule, layer);
      if (!rule.rule) return null;
      const list = next.preferences[layer];
      const existing = list.find(item => item.rule === rule.rule);
      if (existing) {
        existing.confidence = Math.min(
          1,
          Math.max(existing.confidence, rule.confidence) + 0.1
        );
        existing.updatedAt = now();
      } else {
        list.push(rule);
      }
      write(next);
      return existing ?? rule;
    },

    removeRule(layer, id) {
      if (!PREFERENCE_LAYERS.includes(layer)) return false;
      const next = read();
      const list = next.preferences[layer];
      const index = list.findIndex(rule => rule.id === id);
      if (index < 0) return false;
      list.splice(index, 1);
      write(next);
      return true;
    },

    // 反馈环形日志：AI 客户端轮询（feedback.list）与后续规则推断的数据源
    recordFeedback(entry = {}) {
      const next = read();
      const normalized = normalizeAssistantState({
        preferences: next.preferences,
        feedback: [
          ...next.feedback,
          {
            type: entry.type,
            text: entry.text,
            trackId: entry.trackId,
            at: entry.at,
          },
        ],
      });
      write(normalized);
      return normalized.feedback[normalized.feedback.length - 1] ?? null;
    },

    listFeedback({ since = 0, limit = 50 } = {}) {
      const entries = read().feedback.filter(entry => entry.at > since);
      return entries.slice(-Math.min(Math.max(limit, 1), MAX_FEEDBACK_ENTRIES));
    },
  };
}

// RadioEngine for the teachable AI radio (docs/ai-music-assistant-plan.md,
// Phase 1). Design contract: the LLM only picks from real candidates and
// explains why; the program owns dedupe, session history, queue validation
// and refilling. Without an LLM the engine falls back to deterministic
// selection so the radio keeps working.

export const REFILL_THRESHOLD = 3;
export const REFILL_BATCH_SIZE = 5;
export const CANDIDATE_POOL_SIZE = 40;

const stripCodeFences = text =>
  text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

// Tolerant JSON extraction: find the outermost {...} block.
export const extractJsonObject = text => {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
};

const formatRules = preferences => {
  const lines = [];
  for (const rule of preferences?.longTerm ?? []) {
    lines.push(`长期：${rule.rule}`);
  }
  for (const rule of preferences?.session ?? []) {
    lines.push(`本次：${rule.rule}`);
  }
  const now = Date.now();
  for (const rule of preferences?.temporary ?? []) {
    if (!Number.isFinite(rule.expiresAt) || rule.expiresAt > now) {
      lines.push(`暂时：${rule.rule}`);
    }
  }
  return lines;
};

const buildSelectionPrompt = ({ candidates, rules }) => {
  const lines = [
    '你在为 XuMP 的私人电台选接下来的歌。',
    '',
    ...(rules.length ? ['必须遵守的用户偏好：', ...rules, ''] : []),
    '候选歌曲：',
    ...candidates.map(
      c =>
        `#${c.id} ${c.artists || '未知艺人'} - ${c.name}${c.album ? `（${c.album}）` : ''}`
    ),
    '',
    `从候选中选 3-${REFILL_BATCH_SIZE} 首，只返回 JSON，不要输出其他内容：`,
    '{"picks":[{"id":<候选id>,"reason":"<一句中文理由，说明为什么选它>"}]}',
  ];
  return lines.join('\n');
};

const parsePicks = (text, candidates) => {
  if (typeof text !== 'string' || !text.trim()) return [];
  const parsed = extractJsonObject(stripCodeFences(text));
  if (!parsed || !Array.isArray(parsed.picks)) return [];
  const validIds = new Set(candidates.map(c => c.id));
  const seen = new Set();
  const picks = [];
  for (const pick of parsed.picks) {
    const id = Number(pick?.id);
    const reason = typeof pick?.reason === 'string' ? pick.reason.trim() : '';
    if (!Number.isInteger(id) || !validIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    picks.push({ id, reason: reason.slice(0, 120) });
    if (picks.length >= REFILL_BATCH_SIZE) break;
  }
  return picks;
};

export function createRadioEngine({
  getCandidates,
  enqueue,
  getQueue,
  llmChat,
  getPreferences,
  onError = () => {},
  now = Date.now,
  // 0 disables the auto-refill timer (tests); production polls the queue and
  // tops it up whenever it drops below the threshold
  autoRefillIntervalMs = 15000,
} = {}) {
  let active = false;
  let refilling = false;
  let sessionHistory = [];
  let lastPicks = [];
  let lastRefillAt = 0;
  let refillTimer = null;

  const stopTimer = () => {
    if (refillTimer !== null) {
      clearInterval(refillTimer);
      refillTimer = null;
    }
  };

  const getPriorityIds = () => {
    const queue = getQueue?.() || {};
    return Array.isArray(queue.priority) ? queue.priority : [];
  };

  const selectFallback = candidates =>
    candidates.slice(0, REFILL_BATCH_SIZE).map(candidate => ({
      id: candidate.id,
      reason: '',
    }));

  const selectWithLlm = async (candidates, rules) => {
    const text = await llmChat?.({
      system:
        '你是 XuMP 私人电台的选歌助手。只从给定候选中选择，只输出要求的 JSON。',
      prompt: buildSelectionPrompt({ candidates, rules }),
      maxTokens: 900,
    });
    const picks = parsePicks(text, candidates);
    return picks.length > 0 ? picks : null;
  };

  const refill = async () => {
    const exclude = new Set([...sessionHistory, ...getPriorityIds()]);
    let candidates;
    try {
      candidates = (await getCandidates({ limit: CANDIDATE_POOL_SIZE })) ?? [];
    } catch (error) {
      onError('candidates', error);
      return false;
    }
    candidates = candidates.filter(
      candidate => Number.isInteger(candidate?.id) && !exclude.has(candidate.id)
    );
    if (candidates.length === 0) {
      onError('empty', new Error('no candidates available'));
      return false;
    }

    let rules = [];
    try {
      rules = formatRules(await getPreferences?.());
    } catch (error) {
      onError('preferences', error);
    }

    let picks = null;
    if (typeof llmChat === 'function') {
      try {
        picks = await selectWithLlm(candidates, rules);
      } catch (error) {
        onError('llm', error);
      }
    }
    if (!picks || picks.length === 0) {
      // LLM 不可用或没有选出有效结果：按候选顺序取一批，电台继续运转
      picks = selectFallback(candidates);
    } else if (picks.length < REFILL_BATCH_SIZE) {
      // LLM 只选出一部分时（通常是规则过滤得很严），用候选补足批量，
      // 保证电台不断流
      const chosen = new Set(picks.map(pick => pick.id));
      for (const candidate of candidates) {
        if (picks.length >= REFILL_BATCH_SIZE) break;
        if (chosen.has(candidate.id)) continue;
        chosen.add(candidate.id);
        picks.push({ id: candidate.id, reason: '' });
      }
    }

    const ids = picks.map(pick => pick.id);
    try {
      enqueue?.(ids);
    } catch (error) {
      onError('enqueue', error);
      return false;
    }
    sessionHistory = [...sessionHistory, ...ids].slice(-200);
    lastPicks = picks.map(pick => ({
      ...pick,
      at: now(),
    }));
    lastRefillAt = now();
    return true;
  };

  const api = {
    // 启动电台：清空会话历史并立即补一次货
    async start() {
      active = true;
      sessionHistory = [];
      lastPicks = [];
      await api.maybeRefill({ force: true });
      stopTimer();
      if (autoRefillIntervalMs > 0) {
        refillTimer = setInterval(() => {
          api.maybeRefill().catch(error => onError('timer', error));
        }, autoRefillIntervalMs);
      }
      return api.status();
    },
    stop() {
      active = false;
      stopTimer();
      return api.status();
    },
    status() {
      return {
        active,
        refilling,
        enqueuedTotal: sessionHistory.length,
        lastRefillAt,
        lastPicks,
      };
    },
    // 队列低于阈值时补货；force 用于启动或测试
    async maybeRefill({ force = false } = {}) {
      if (!active || refilling) return false;
      if (!force && getPriorityIds().length >= REFILL_THRESHOLD) return false;
      refilling = true;
      try {
        return await refill();
      } finally {
        refilling = false;
      }
    },
    _parsePicksForTests: parsePicks,
  };
  return api;
}

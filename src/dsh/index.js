/**
 * DSH integration adapter. Wires the engine into a live session:
 *  - a guard on `agent/turn-stopping` (turn-end) that steers a rewrite, and
 *  - a `/report` command for a manual check.
 *
 * Design notes:
 *  - Fail-open. A turn-stopping listener that throws aborts the turn, so every
 *    path here is wrapped: on any error we log and return, never throw.
 *  - Human-facing only. Subagent sessions (header.origin === 'subagent') and
 *    backstage messages are skipped; only the turn's ending assistant text is checked.
 *  - Advisory by default. Only `mode: enforce` injects a rewrite; advisory just observes.
 *  - The heavy lifting is in ../engine.js (pure, tested). This file is a thin shell;
 *    if your DSH version exposes session events / steer / commands differently, adjust
 *    only the small accessor helpers below.
 */
export const name = 'report-gate';

export async function apply(ctx, config = {}) {
  try {
    await install(ctx, config);
  } catch (e) {
    try { ctx.logger?.warn?.(`report-gate: failed to install: ${e?.message}`); } catch { /* ignore */ }
  }
}

async function install(ctx, config) {
  const { checkReport } = await import('../engine.js');
  const { loadPacks, loadConfigFromDir, mergeConfig, DEFAULT_CONFIG } = await import('../config.js');
  const { textOf, turnAssistantText, lastAssistantText } = await import('../events.js');

  const repoCfg = safe(() => loadConfigFromDir(process.cwd()), {});
  const cfg = mergeConfig(DEFAULT_CONFIG, repoCfg, config || {});
  const packs = loadPacks(cfg.packs);
  const retryLimit = cfg.retryLimit ?? 2;
  const attempts = new WeakMap();

  function readEvents(session) {
    if (!session) return null;
    for (const k of ['snapshotEvents', 'events', 'allEvents']) {
      try {
        const v = session[k];
        if (typeof v === 'function') { const r = v.call(session); if (Array.isArray(r)) return r; }
        else if (Array.isArray(v)) return v;
      } catch { /* try next */ }
    }
    return null;
  }

  async function checkTurn(agent, turn) {
    if (!agent || !agent.session) return null;
    const header = agent.session.header || {};
    if (header.origin === 'subagent') return null;
    const events = readEvents(agent.session);
    if (!events) return null;
    const target = turnAssistantText(events, turn) || lastAssistantText(events);
    if (!target) return null;
    return { target, result: checkReport(textOf(target), { events, reportSeq: target.seq, config: cfg, packs }) };
  }

  function rewriteMessage(r) {
    const lines = ['你上一条是给人看的最终汇报，但里面有读者无法理解的内部代号或未解释词。请重写后再交。'];
    if (r.tier1.length) lines.push(`Tier-1 内部代号（必须在报告内就地解释，如 “M5 = 第 5 条实测”，或删除）：${r.tier1.join('、')}`);
    if (r.tier2a.length) lines.push(`从未对人出现过的标识符（放进附录名词表并解释）：${r.tier2a.slice(0, 12).join('、')}`);
    if (r.tier3.length) lines.push(`可能是术语的普通词（请判断是否需解释）：${r.tier3.map((x) => x.word).join('、')}`);
    lines.push('结构：一句话结论（不含代号）→ 需要读者决定的事 → 名词表（覆盖每个代号）→ 技术细节放附录。不要删事实。');
    return lines.join('\n');
  }

  ctx.on?.('agent/turn-stopping', async ({ agent, turn }) => {
    try {
      const r = await checkTurn(agent, turn);
      if (!r || r.result.verdict !== 'FAIL') return;
      if (cfg.mode !== 'enforce') return;
      const n = attempts.get(agent) || 0;
      if (n >= retryLimit) return;
      attempts.set(agent, n + 1);
      const { createUserMessage } = await import('@deepseek-ai/dsh-llm');
      agent.steer(createUserMessage({ content: [{ type: 'text', text: rewriteMessage(r.result) }], source: { kind: 'report-gate' } }));
      ctx.logger?.info?.(`report-gate: steered rewrite (attempt ${n + 1}/${retryLimit})`);
    } catch (e) {
      try { ctx.logger?.warn?.(`report-gate: guard error ignored: ${e?.message}`); } catch { /* ignore */ }
    }
  });

  try {
    ctx.commands?.register?.({
      name: 'report',
      description: "Check the readability of this turn's human-facing report.",
      handler: async ({ agent } = {}) => {
        const r = await checkTurn(agent || ctx.get?.('agents')?.current?.(), undefined);
        if (!r) return { text: 'report-gate: 没有找到可检查的汇报正文。' };
        const { formatResult } = await import('../report.js');
        return { text: formatResult(r.result) };
      },
    });
  } catch { /* commands service may be absent */ }
}

function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }

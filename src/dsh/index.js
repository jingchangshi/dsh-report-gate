/** DSH adapter: inspect completed responses and expose the last result through /report. */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { checkReport } from '../engine.js';
import { loadPacks, loadConfigFromDir, mergeConfig, DEFAULT_CONFIG, validateConfig } from '../config.js';
import { textOf, turnAssistantText, lastAssistantText } from '../events.js';
import { formatResult } from '../report.js';

export const name = 'report-gate';
export const inject = ['commands'];

function rewriteMessage(r) {
  const lines = ['请只针对下列问题重新汇报，保留事实、条件和不确定性。'];
  if (r.tier1.length) lines.push(`未解释的代号：${r.tier1.slice(0, 12).join('、')}。请删除或解释其实际含义。`);
  for (const hit of r.styleHits.filter((h) => h.level === 'hard').slice(0, 5)) {
    lines.push(`第 ${hit.line} 行：${hit.message}${hit.snippet ? `（${hit.snippet}）` : ''}`);
  }
  lines.push('代码、文件名、版本号、环境变量等证据不需要逐条解释。');
  return lines.join('\n');
}

/** Resolve workspace configuration for each agent, not the Web process cwd. */
function sessionDirectory(session, events) {
  const change = events.findLast((event) => event.type === 'working-directory/change' && typeof event.data?.cwd === 'string');
  return change?.data.cwd ?? session.header.cwd ?? process.cwd();
}

export function apply(ctx, config = {}) {
  const attempts = new WeakMap();
  const lastChecks = new WeakMap();

  function check(agent, turn) {
    if (!agent?.session || agent.session.header.origin === 'subagent') return null;
    const events = agent.session.snapshotEvents();
    const target = turn === undefined ? lastAssistantText(events) : turnAssistantText(events, turn);
    if (!target) return null;
    const repoCfg = loadConfigFromDir(sessionDirectory(agent.session, events));
    const cfg = validateConfig(mergeConfig(DEFAULT_CONFIG, repoCfg, config));
    const packs = loadPacks(cfg.packs);
    return { turn: target.data.turn ?? null, seq: target.seq, cfg, result: checkReport(textOf(target), { events, reportSeq: target.seq, config: cfg, packs }) };
  }

  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    try {
      const entry = check(agent, turn);
      if (!entry) return;
      lastChecks.set(agent, entry);
      ctx.logger.info(`report-gate: session ${agent.session.id} turn ${turn}, ${entry.result.verdict} (${entry.cfg.mode})`);
      if (entry.cfg.mode !== 'enforce' || entry.result.verdict !== 'FAIL') return;
      const previous = attempts.get(agent);
      const count = previous?.turn === turn ? previous.count : 0;
      if (count >= entry.cfg.retryLimit) {
        ctx.logger.warn(`report-gate: session ${agent.session.id} turn ${turn} reached the rewrite limit`);
        entry.exhausted = true;
        return;
      }
      agent.steer(createUserMessage({
        content: [{ type: 'text', text: rewriteMessage(entry.result) }],
        source: { kind: 'report-gate', form: 'notice', summary: '报告可读性检查要求重写' },
      }));
      attempts.set(agent, { turn, count: count + 1 });
    } catch (error) {
      lastChecks.set(agent, { error: String(error?.message ?? error), turn });
      ctx.logger.warn(`report-gate: automatic check failed: ${String(error?.message ?? error)}`);
    }
  });

  ctx.commands.register({
    name: 'report',
    description: '查看最近一次自动可读性检查；未执行时检查最近一条助手回复。',
    handler: ({ agent }) => {
      try {
        const automatic = lastChecks.get(agent);
        const entry = automatic && !automatic.error ? automatic : check(agent);
        if (!entry) return { kind: 'error', text: '没有找到可检查的助手回复。' };
        const origin = automatic && !automatic.error ? '最近一次自动检查' : '当前手动检查（此 Agent 没有可用的自动检查记录）';
        const suffix = entry.exhausted ? '\n\n已达到重写次数上限，原报告仍已显示。' : '';
        return { kind: 'success', text: `${origin}：第 ${entry.turn ?? '未知'} 轮，消息序号 ${entry.seq}。\n\n${formatResult(entry.result)}${suffix}` };
      } catch (error) {
        return { kind: 'error', text: `report-gate 检查失败：${String(error?.message ?? error)}` };
      }
    },
  });
}

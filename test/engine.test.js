import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSession } from '../src/session.js';
import { lastAssistantText, textOf } from '../src/events.js';
import { checkReport } from '../src/engine.js';
import { loadPacks } from '../src/config.js';

const ROOT = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1');

test('real report FAILs: labels to Tier-1, policy to Tier-3, human terms exempt', () => {
  const events = loadSession(p('test/fixtures/session-sample.jsonl'));
  const target = lastAssistantText(events);
  const r = checkReport(textOf(target), { events, reportSeq: target.seq, config: { lang: 'zh' }, packs: loadPacks(['generic', 'ste-zh']) });
  assert.equal(r.verdict, 'FAIL');
  for (const t of ['M5', 'M6', 'M7', 'S0', 'D2']) assert.ok(r.tier1.includes(t), `tier1 has ${t}`);
  assert.ok(r.tier3.some((x) => x.word === 'policy'), 'policy surfaces as Tier-3 candidate');
  for (const t of ['Native', 'Triton', 'A3', 'BarAll', 'Cube']) {
    assert.ok(!r.tier1.includes(t) && !r.tier2a.includes(t), `${t} must not be flagged`);
  }
});
test('a label defined in place is not a Tier-1 violation (satisfiable)', () => {
  const report = '## 名词表\n- M5 = 第 5 条实测结论\n- D2 = 第 2 条待定决策\n';
  const r = checkReport(report, { events: [], config: { lang: 'zh' }, packs: loadPacks(['generic']) });
  assert.ok(!r.tier1.includes('M5'));
  assert.ok(!r.tier1.includes('D2'));
  assert.equal(r.verdict, 'PASS');
});
test('an allowlist pack suppresses type-token false positives', () => {
  const report = '类型 f16 f32 i32 x86 L2 都是原语。';
  const labels = { id: 'lp', labelPatterns: ['(?<![A-Za-z0-9\\\\-])[A-Za-z]{1,2}\\d{1,2}(?![A-Za-z0-9])'], allowlist: [] };
  const rNo = checkReport(report, { events: [], config: { lang: 'zh' }, packs: [labels] });
  assert.ok(rNo.tier1.includes('f16'), 'f16 matches label shape without allowlist');
  const allowPack = { id: 'mlir', labelPatterns: [], allowlist: loadPacks(['mlir'])[0].allowlist };
  const rOk = checkReport(report, { events: [], config: { lang: 'zh' }, packs: [labels, allowPack] });
  assert.ok(!rOk.tier1.includes('f16'), 'allowlist removes type tokens');
});
test('a clean, contract-compliant report PASSes', () => {
  const events = loadSession(p('test/fixtures/session-clean.jsonl'));
  const target = lastAssistantText(events);
  const r = checkReport(textOf(target), { events, reportSeq: target.seq, config: { lang: 'zh' }, packs: loadPacks(['generic', 'ste-zh', 'mlir']) });
  assert.equal(r.verdict, 'PASS', JSON.stringify({ t1: r.tier1, t2: r.tier2a, style: r.styleHits }));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSession } from '../src/session.js';
import { lastAssistantText, textOf } from '../src/events.js';
import { checkReport, proseOf } from '../src/engine.js';
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
test('an allowlist pack suppresses label-shaped primitive tokens', () => {
  const report = '依赖 L2 与 f16。';
  const labels = { id: 'lp', labelPatterns: ['(?<![A-Za-z0-9\\\\-])[A-Za-z]{1,2}\\d{1,2}(?![A-Za-z0-9])'], allowlist: [] };
  const rNo = checkReport(report, { events: [], config: { lang: 'zh' }, packs: [labels] });
  assert.ok(rNo.tier1.includes('L2'), 'L2 is label-shaped without the allowlist');
  assert.ok(!rNo.tier1.includes('f16'), 'lowercase letter+digits are treated as evidence');
  const allowPack = { id: 'mlir', labelPatterns: [], allowlist: loadPacks(['mlir'])[0].allowlist };
  const rOk = checkReport(report, { events: [], config: { lang: 'zh' }, packs: [labels, allowPack] });
  assert.ok(!rOk.tier1.includes('L2'), 'allowlist removes the primitive');
});
test('compound identifiers require every component to be known', () => {
  const events = [{ seq: 1, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Known' }] } }];
  const r = checkReport('Known.UnknownThing Known.Allowed', {
    events, reportSeq: 2, config: { allowlist: ['Allowed'] },
  });
  assert.ok(r.tier2a.includes('Known.UnknownThing'));
  assert.ok(!r.tier2a.includes('Known.Allowed'));
});

test('tilde fenced blocks are excluded from prose and identifier checks', () => {
  const report = '之前\n~~~js\nHiddenThing42\n~~~~\n之后 VisibleThing42';
  const prose = proseOf(report);
  assert.ok(!prose.includes('HiddenThing42'));
  assert.ok(prose.includes('之前') && prose.includes('VisibleThing42'));
  const r = checkReport(report, { events: [] });
  assert.ok(!r.tier2a.includes('HiddenThing42'));
  assert.ok(r.tier2a.includes('VisibleThing42'));
});

test('future backstage frequency does not create a Tier-3 finding', () => {
  const events = [1, 2, 3, 4, 5, 6].map((seq) => ({
    seq, type: 'tool/result', data: { content: [{ type: 'text', text: 'policy' }] },
  }));
  const r = checkReport('policy', { events, reportSeq: 2 });
  assert.ok(!r.tier3.some((x) => x.word === 'policy'));
});

test('a clean, contract-compliant report PASSes', () => {
  const events = loadSession(p('test/fixtures/session-clean.jsonl'));
  const target = lastAssistantText(events);
  const r = checkReport(textOf(target), { events, reportSeq: target.seq, config: { lang: 'zh' }, packs: loadPacks(['generic', 'ste-zh', 'mlir']) });
  assert.equal(r.verdict, 'PASS', JSON.stringify({ t1: r.tier1, t2: r.tier2a, style: r.styleHits }));
});

test('inline code and evidence-shaped tokens are not readability findings', () => {
  const report = '参照 `CMake`、`IR`、`AIV`、`18.1.3`、`{{ACCOUNT_x}}`、`DeviceCompileCommand.cpp`、`s4`、`multi3` 与 debian10 的说明。';
  const r = checkReport(report, { events: [], config: { lang: 'zh' }, packs: loadPacks(['generic']) });
  assert.deepEqual(r.tier1, []);
  assert.deepEqual(r.tier2a, []);
  assert.deepEqual(r.tier2b, []);
  assert.equal(r.verdict, 'PASS');
});
test('uppercase labels remain Tier-1 while lowercase code ids do not', () => {
  const r = checkReport('见 M5 与 s5。', { events: [], config: { lang: 'zh' }, packs: loadPacks(['generic']) });
  assert.deepEqual(r.tier1, ['M5']);
});
test('brace term lists still surface when events make them unknown', () => {
  const events = Array.from({ length: 6 }, (_, i) => ({
    type: 'agent-message', seq: i + 1,
    data: { message: { content: [{ type: 'text', text: 'bundles eligibility policy。' }] } },
  }));
  const r = checkReport('{bundles, eligibility}', { events, reportSeq: 100, config: { lang: 'zh' }, packs: loadPacks(['generic']) });
  const words = r.tier3.map((x) => x.word);
  assert.ok(words.includes('bundles') || words.includes('eligibility') || r.tier2a.includes('bundles') || r.tier2a.includes('eligibility'));
});

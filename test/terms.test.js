import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokensOf, identLike, definedInReport, glossedAt } from '../src/terms.js';

test('tokensOf captures leading-hyphen flags and digit-leading tokens from plain text', () => {
  const t = tokensOf('见 -replexitval 与 9fda3e1 两个记号');
  assert.ok(t.includes('-replexitval'));
  assert.ok(t.includes('9fda3e1'));
});
test('tokensOf treats brace lists as terms even when words look ordinary', () => {
  const t = tokensOf('结果必须是 {bundles, eligibility}');
  assert.ok(t.includes('bundles'));
  assert.ok(t.includes('eligibility'));
});
test('identLike: type tokens and labels look like identifiers, plain words do not', () => {
  assert.equal(identLike('f16'), true);
  assert.equal(identLike('M5'), true);
  assert.equal(identLike('policy'), false);
});
test('definedInReport: in-place definition counts, bare mention does not', () => {
  assert.equal(definedInReport('M5 = 第 5 条实测', 'M5'), true);
  assert.equal(definedInReport('M5 见下', 'M5'), false);
});
test('glossedAt detects parenthetical gloss', () => {
  const s = 'Native（进程内后端）是默认路径';
  const i = s.indexOf('Native');
  assert.equal(glossedAt(s, i, i + 6), true);
});

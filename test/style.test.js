import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyStyle } from '../src/style.js';
import { loadPack } from '../src/config.js';

test('zh STE rules catch wrapper verb, vague word, marketing filler', () => {
  const hits = applyStyle('我们进行了优化，性能显著提升，开箱即用。', [loadPack('ste-zh')], 'zh');
  const rules = hits.map((h) => h.rule);
  assert.ok(rules.includes('3.1'), '进行 -> 3.1');
  assert.ok(rules.includes('1.4'), '显著 -> 1.4');
  assert.ok(rules.includes('9.4'), '开箱即用 -> 9.4');
});
test('style skips fenced code', () => {
  const hits = applyStyle('```\n我们进行了优化，显著提升\n```\n', [loadPack('ste-zh')], 'zh');
  assert.equal(hits.length, 0);
});
test('long sentence is flagged as soft 6.3', () => {
  const long = '这是'.repeat(30) + '。';
  const hits = applyStyle(long, [loadPack('ste-zh')], 'zh');
  assert.ok(hits.some((h) => h.rule === '6.3'));
});
test('en wrapper verb is flagged', () => {
  const hits = applyStyle('We should perform a validation of the input.', [loadPack('ste-en')], 'en');
  assert.ok(hits.some((h) => h.rule === '3.1'));
});

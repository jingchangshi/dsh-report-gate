import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSimpleYaml, mergeConfig, loadPacks, DEFAULT_CONFIG } from '../src/config.js';

test('parseSimpleYaml handles scalars, lists and one nesting level', () => {
  const y = `mode: enforce\nbudget: 3\nallowlist:\n  - Triton\n  - Cube\nsemantic:\n  enabled: true\n  model: group/validator\n`;
  const o = parseSimpleYaml(y);
  assert.equal(o.mode, 'enforce');
  assert.equal(o.budget, 3);
  assert.deepEqual(o.allowlist, ['Triton', 'Cube']);
  assert.equal(o.semantic.enabled, true);
  assert.equal(o.semantic.model, 'group/validator');
});
test('mergeConfig concatenates allowlist and deep-merges objects', () => {
  const m = mergeConfig(DEFAULT_CONFIG, { allowlist: ['a'] }, { allowlist: ['b'], semantic: { enabled: true } });
  assert.deepEqual(m.allowlist, ['a', 'b']);
  assert.equal(m.semantic.enabled, true);
  assert.equal(m.budget, DEFAULT_CONFIG.budget);
});
test('loadPacks resolves named packs', () => {
  const ids = loadPacks(['generic', 'mlir', 'ste-zh']).map((p) => p.id);
  assert.deepEqual(ids, ['generic', 'mlir', 'ste-zh']);
});

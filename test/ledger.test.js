import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSession } from '../src/session.js';
import { buildLedger } from '../src/ledger.js';

const ROOT = new URL('..', import.meta.url);
const events = loadSession(new URL('test/fixtures/session-sample.jsonl', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

test('ledger grounds every term the human typed', () => {
  const l = buildLedger(events, 900);
  for (const t of ['Native', 'Triton', '-replexitval', 'A3', 'BarAll', 'Cube']) {
    assert.ok(l.humanSaid.has(t), `human said ${t}`);
    assert.ok(l.grounded.has(t), `grounded ${t}`);
  }
});
test('ledger keeps backstage-only words out of the human channel', () => {
  const l = buildLedger(events, 900);
  assert.ok(!l.humanVisible.has('policy'), 'policy never shown to human before report');
  assert.ok((l.internalFreq.get('policy') || 0) >= 3, 'policy is heavy in backstage');
});

test('ledger excludes backstage text at and after the report boundary', () => {
  const event = (seq, text) => ({ seq, type: 'tool/result', data: { content: [{ type: 'text', text }] } });
  const l = buildLedger([
    event(1, 'earlier shared'), event(2, 'boundary shared'), event(3, 'future shared'),
  ], 2);
  assert.equal(l.internalFreq.get('shared'), 1);
  assert.equal(l.internalFreq.get('boundary'), undefined);
  assert.equal(l.internalFreq.get('future'), undefined);
  assert.deepEqual(l.provenance.get('shared'), { seq: 1, kind: 'tool/result' });
  assert.equal(l.provenance.has('boundary'), false);
  assert.equal(l.provenance.has('future'), false);
});

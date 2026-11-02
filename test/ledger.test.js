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

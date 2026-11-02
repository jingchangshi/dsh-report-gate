import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function runCli(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, ['src/cli.js', ...args], { cwd: ROOT, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
  }
}

test('CLI FAILs (exit 1) on the sample and reports M5', () => {
  const r = runCli(['check', 'test/fixtures/session-sample.jsonl', '--lang', 'zh', '--json']);
  assert.equal(r.code, 1);
  const out = JSON.parse(r.out);
  assert.equal(out.verdict, 'FAIL');
  assert.ok(out.tier1.includes('M5'));
});
test('CLI PASSes (exit 0) on a clean report with the example config', () => {
  const r = runCli(['check', 'test/fixtures/session-clean.jsonl', '--config', 'examples/.dsh/report-readability.yml', '--json']);
  assert.equal(r.code, 0, r.out);
  assert.equal(JSON.parse(r.out).verdict, 'PASS');
});

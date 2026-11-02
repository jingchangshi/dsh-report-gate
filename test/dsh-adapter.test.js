import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, inject } from '../src/dsh/index.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('corrected workspace configuration can recover after an automatic error', async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dsh-report-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, '.dsh'));
  const file = path.join(dir, '.dsh', 'report-readability.yml');
  writeFileSync(file, 'packs: [missing-pack]\n');
  let command, stop;
  const ctx = { on(_name, callback) { stop = callback; }, commands: { register(value) { command = value; } }, logger: { info() {}, warn() {} } };
  await apply(ctx);
  const agent = { session: { id: 'test', header: { cwd: dir }, snapshotEvents: () => [
    { type: 'assistant/message', seq: 1, data: { turn: 1, message: { content: [{ type: 'text', text: '完成。' }] } } },
  ] } };
  stop({ agent, turn: 1 });
  assert.equal((await command.handler({ agent })).kind, 'error');
  writeFileSync(file, 'packs: [generic]\n');
  const result = await command.handler({ agent });
  assert.equal(result.kind, 'success');
  assert.match(result.text, /当前手动检查/);
});

test('report command returns a DSH command result', async () => {
  let command;
  const ctx = { on() {}, commands: { register(value) { command = value; } } };
  await apply(ctx);
  assert.deepEqual(inject, ['commands']);
  assert.equal(command.name, 'report');
  const agent = { session: { header: {}, snapshotEvents: () => [
    { type: 'assistant/message', seq: 1, data: { turn: 1, message: { content: [{ type: 'text', text: '结果正常。' }] } } },
  ] } };
  const result = await command.handler({ agent });
  assert.equal(result.kind, 'success');
  assert.match(result.text, /报告可读性检查/);
  const missing = await command.handler({ agent: { session: { header: {}, snapshotEvents: () => [] } } });
  assert.equal(missing.kind, 'error');
});

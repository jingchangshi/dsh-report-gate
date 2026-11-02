import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Commands from '@deepseek-ai/dsh-commands';
import { agentEvents } from '@deepseek-ai/dsh-agent';
import { createScope } from '@deepseek-ai/dsh-scope';
import * as reportGate from '../src/dsh/index.js';

class ScriptedAdapter extends LlmAdapter {
  constructor(script) { super(); this.script = script; this.requests = []; }
  async resolveModel(provider, model) { return { provider, id: model, name: model }; }
  async *stream(options) {
    this.requests.push(options);
    const text = this.script.shift();
    if (text === undefined) throw new Error('script exhausted');
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

async function setup(mode, script, extraConfig = {}) {
  const ctx = new Context();
  for (const plugin of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry, Commands]) await ctx.plugin(plugin);
  await ctx.plugin(AgentLoop, { agents: [] });
  await ctx.plugin(reportGate, { mode, packs: ['generic'], budget: 100, retryLimit: 1, ...extraConfig });
  const adapter = new ScriptedAdapter(script);
  ctx.llm.registerAdapter(['mock'], adapter);
  const agent = await ctx.agentLoop.create(SessionId(`test-${mode}`), { provider: 'mock', model: 'mock' });
  return { ctx, agent, adapter };
}

async function runTurn(ctx, agent) {
  const idle = new Promise((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') { dispose(); resolve(); }
    });
  });
  agent.followup(createUserMessage({ content: [{ type: 'text', text: '请总结。' }], source: { kind: 'user' } }));
  await idle;
}

test('real DSH advisory turn records an accessible automatic result without rewriting', async () => {
  const { ctx, agent, adapter } = await setup('advisory', ['建议采用 M5。']);
  try {
    await runTurn(ctx, agent);
    assert.equal(adapter.requests.length, 1);
    const response = await ctx.commands.execute(agent, '/report', [], new AbortController().signal);
    assert.equal(response.result.kind, 'success');
    assert.match(response.result.text, /最近一次自动检查/);
    assert.match(response.result.text, /M5/);
  } finally { await ctx.fiber.dispose(); }
});

test('a recreated Agent can manually check the restored conversation', async () => {
  const { ctx, agent } = await setup('advisory', ['建议采用 M5。']);
  try {
    await runTurn(ctx, agent);
    const seed = [...agent.session.snapshotEvents()];
    const { agent: restored } = await ctx.agents.create({ sessionId: SessionId('restored'), agentOptions: { provider: 'mock', model: 'mock' }, seed });
    const response = await ctx.commands.execute(restored, '/report', [], new AbortController().signal);
    assert.equal(response.result.kind, 'success');
    assert.match(response.result.text, /当前手动检查/);
    assert.match(response.result.text, /M5/);
  } finally { await ctx.fiber.dispose(); }
});

test('real DSH exposes exhausted rewrite budget', async () => {
  const { ctx, agent, adapter } = await setup('enforce', ['建议采用 M5。', '仍然采用 M5。']);
  try {
    await runTurn(ctx, agent);
    assert.equal(adapter.requests.length, 2);
    const response = await ctx.commands.execute(agent, '/report', [], new AbortController().signal);
    assert.match(response.result.text, /重写次数上限/);
  } finally { await ctx.fiber.dispose(); }
});

test('style failures supply their rule to the model', async () => {
  const { ctx, agent, adapter } = await setup('enforce', ['我们进行了检查。', '我们检查了。'], { packs: ['ste-zh'], labelPatterns: [] });
  try {
    await runTurn(ctx, agent);
    assert.equal(adapter.requests.length, 2);
    assert.match(JSON.stringify(adapter.requests[1].messages), /包装动词/);
  } finally { await ctx.fiber.dispose(); }
});

test('real DSH enforce mode steers one rewrite and resets budget next turn', async () => {
  const { ctx, agent, adapter } = await setup('enforce', ['建议采用 M5。', '已经完成。', '建议采用 S0。', '再次完成。']);
  try {
    await runTurn(ctx, agent);
    assert.equal(adapter.requests.length, 2);
    assert.match(JSON.stringify(adapter.requests[1].messages), /M5/);
    await runTurn(ctx, agent);
    assert.equal(adapter.requests.length, 4);
    assert.match(JSON.stringify(adapter.requests[3].messages), /S0/);
  } finally { await ctx.fiber.dispose(); }
});

test('a host-level listener receives agent events from a preset-scoped agent', async () => {
  const host = new Context();
  const seen = [];
  host.on('agent/turn-stopping', ({ turn }) => seen.push(['host', turn]));
  const presetKey = {};
  const preset = createScope(host, presetKey);
  const sibling = createScope(host, {});
  sibling.ctx.on('agent/turn-stopping', () => seen.push(['sibling']));
  const agent = {};
  const agentScope = createScope(host, agent, { parent: presetKey });
  try {
    await agentEvents(agentScope.ctx, agent).serial('agent/turn-stopping', { turn: 7, signal: new AbortController().signal });
    assert.deepEqual(seen, [['host', 7]], 'host plugin sees the preset agent; an unrelated scope does not');
  } finally {
    await agentScope.dispose(); await preset.dispose(); await sibling.dispose(); await host.fiber.dispose();
  }
});

test('advisory identifiers alone do not trigger a rewrite', async () => {
  const { ctx, agent, adapter } = await setup('enforce', ['参见 WidgetRegistry 与 CMake。']);
  try {
    await runTurn(ctx, agent);
    assert.equal(adapter.requests.length, 1, 'Tier-2 alone must not steer');
  } finally { await ctx.fiber.dispose(); }
});

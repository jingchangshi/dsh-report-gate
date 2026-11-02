/**
 * Event helpers: extract message text and classify where a message came from.
 * The whole design rests on one fact: DSH records `data.source.kind` for every
 * user-role message, so "the human said it" (kind === 'user') is distinguishable
 * from teammate relays (agent-message), subagent notices (subagent-settled),
 * tool results, system prompts, runtime context, etc.
 */

/** Kinds that mean the human authored the text. */
export const HUMAN_KINDS = new Set(['user']);

/** Concatenate the text blocks of an event (works for user/message and assistant/message). */
export function textOf(event) {
  const d = (event && event.data) || {};
  const msg = d.message && typeof d.message === 'object' ? d.message : d;
  const c = msg && msg.content;
  if (!Array.isArray(c)) return '';
  return c.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
}

/** The recorded source kind of an event ('user', 'agent-message', 'assistant', ...). */
export function sourceKind(event) {
  if (!event) return '?';
  if (event.type === 'user/message') {
    return (event.data && event.data.source && event.data.source.kind) || '?';
  }
  if (event.type === 'assistant/message') return 'assistant';
  return event.type;
}

/** True when the human wrote this message. */
export function isHumanAuthored(event) {
  return sourceKind(event) === 'user';
}

/** True when the text was rendered to the human: the human's own words + non-empty assistant text. */
export function isHumanVisible(event) {
  const k = sourceKind(event);
  if (k === 'user') return true;
  if (k === 'assistant') return Boolean(textOf(event).trim());
  return false;
}

/** Everything the human did NOT see: teammate/subagent/tool/system/context. */
export function isBackstage(event) {
  return !isHumanVisible(event);
}

/** The last non-empty assistant message in the list (the usual human-facing report). */
export function lastAssistantText(events) {
  let target = null;
  for (const e of events) {
    if (e && e.type === 'assistant/message' && textOf(e).trim()) target = e;
  }
  return target;
}

/** The last non-empty assistant message that belongs to a given turn, when turns are recorded. */
export function turnAssistantText(events, turn) {
  let target = null;
  for (const e of events) {
    if (!e || e.type !== 'assistant/message' || !textOf(e).trim()) continue;
    const t = e.data && e.data.turn;
    if (turn === undefined || t === turn) target = e;
  }
  return target;
}

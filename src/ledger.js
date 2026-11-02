/**
 * Grounding ledger: what has this specific human actually been shown/taught?
 * Built ONLY from the durable event log's human channel, up to (not including)
 * the report under review. Never from a compacted/derived view — compaction can
 * drop the human's earliest messages, which would corrupt the ledger.
 */
import { textOf, sourceKind } from './events.js';
import { tokensOf, glossedAt } from './terms.js';

function incr(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

/**
 * @param {Array<object>} events session events (already ordered by seq)
 * @param {number} reportSeq everything at or after this seq is treated as "the future"
 * @returns {{grounded:Set<string>, humanSaid:Set<string>, humanVisible:Set<string>,
 *            humanFreq:Map<string,number>, internalFreq:Map<string,number>,
 *            provenance:Map<string,{seq:number,kind:string}>}}
 */
export function buildLedger(events, reportSeq = Infinity) {
  const grounded = new Set();
  const humanSaid = new Set();
  const humanVisible = new Set();
  const humanFreq = new Map();
  const internalFreq = new Map();
  const provenance = new Map();

  for (const e of events) {
    if (!e || e.seq === undefined || e.seq >= reportSeq) continue;
    const t = textOf(e);
    const kind = sourceKind(e);

    for (const tok of tokensOf(t, { braces: false })) {
      if (!provenance.has(tok)) provenance.set(tok, { seq: e.seq, kind });
    }

    const human = kind === 'user' || (kind === 'assistant' && t.trim().length > 0);
    if (e.seq < reportSeq && human) {
      for (const tok of tokensOf(t, { braces: false })) {
        humanVisible.add(tok);
        incr(humanFreq, tok.toLowerCase());
      }
      if (kind === 'user') {
        for (const tok of tokensOf(t)) humanSaid.add(tok); // every raw token the human typed
      }
      for (const m of t.matchAll(/-{0,2}[A-Za-z0-9][A-Za-z0-9_.\-]{0,47}/g)) {
        const tok = m[0];
        if (glossedAt(t, m.index, m.index + tok.length)) grounded.add(tok);
      }
    }
    if (!human) {
      for (const tok of tokensOf(t, { braces: false })) incr(internalFreq, tok.toLowerCase());
    }
  }

  for (const tok of humanSaid) grounded.add(tok); // what the human said is known by definition
  return { grounded, humanSaid, humanVisible, humanFreq, internalFreq, provenance };
}

/** A ledger for "no session events available" (everything is novel unless allowlisted). */
export function emptyLedger() {
  return {
    grounded: new Set(), humanSaid: new Set(), humanVisible: new Set(),
    humanFreq: new Map(), internalFreq: new Map(), provenance: new Map(),
  };
}

/**
 * The check engine: pure, domain-neutral. Given a report, the session events
 * (for the grounding ledger), a config and the loaded rule packs, it returns a
 * tiered verdict. It never touches the filesystem or the network.
 */
import { tokensOf, identLike, definedInReport } from './terms.js';
import { buildLedger, emptyLedger } from './ledger.js';
import { applyStyle } from './style.js';
import { DEFAULT_CONFIG, mergeConfig } from './config.js';

/**
 * Strip fenced blocks and every inline code span: inline code is evidence the
 * report cites, not prose the reader must have explained. Brace lists such as
 * `{bundles, eligibility}` are recovered by {@link braceTerms}.
 */
export function proseOf(t) {
  let s = String(t).replace(/^ {0,3}(~{3,})[^\r\n]*\r?\n[\s\S]*?^ {0,3}\1~*[ \t]*\r?$/gm, ' ');
  s = s.replace(/```[\s\S]*?```/g, ' ');
  return s.replace(/`[^`]*`/g, ' ');
}

/** Term pairs written as a brace list, e.g. `{bundles, eligibility}`. */
export function braceTerms(report) {
  const text = String(report).replace(/^ {0,3}(~{3,})[^\r\n]*\r?\n[\s\S]*?^ {0,3}\1~*[ \t]*\r?$/gm, ' ').replace(/```[\s\S]*?```/g, ' ');
  const out = [];
  for (const m of text.matchAll(/\{([A-Za-z0-9_\- ,]{1,140})\}/g)) {
    const parts = m[1].split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2 || parts.length > 8) continue;
    for (const part of parts) if (/^[A-Za-z][A-Za-z0-9_\-]{0,30}$/.test(part)) out.push(part);
  }
  return out;
}

const EXT = /\.(?:md|cpp|cc|cxx|c|h|hpp|so|a|o|py|js|mjs|ts|json|ya?ml|txt|sh|cmake)$/i;

/** Evidence-shaped tokens: versions, paths, env/constant names, placeholders, code ids. */
export function evidenceish(tok, ignoreRegexes = []) {
  if (/\{\{|\}\}/.test(tok)) return true;
  if (tok.includes('/') || tok.includes('\\')) return true;
  if (EXT.test(tok)) return true;
  if (/^\d+(?:\.\d+){1,3}$/.test(tok)) return true;
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(tok)) return true;
  if (/^[a-z]{1,6}\d{1,3}$/.test(tok)) return true;
  return ignoreRegexes.some((re) => re.test(tok));
}

const dedup = (a) => [...new Set(a)];

function numericish(tok) { return /^(?:\d+(?:[-–]\d+)?\.?|0x[0-9a-f]+)$/i.test(tok); }

function partGrounded(tok, state, allow) {
  if (!/[-/.]/.test(tok)) return false;
  const parts = tok.split(/[-/.]/).filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every((p) => state.grounded.has(p) || state.humanSaid.has(p) || allow.has(p.toLowerCase()));
}

/**
 * @param {string} report
 * @param {{events?: Array<object>|null, reportSeq?: number, config?: object, packs?: Array<object>}} opts
 */
export function checkReport(report, opts = {}) {
  const { events = null, reportSeq = Infinity, config = {}, packs = [] } = opts;
  const cfg = mergeConfig(DEFAULT_CONFIG, config);
  const state = events ? buildLedger(events, reportSeq) : emptyLedger();

  const allow = new Set((cfg.allowlist || []).map((s) => String(s).toLowerCase()));
  for (const p of packs) for (const a of p.allowlist || []) allow.add(String(a).toLowerCase());
  const labelSources = [...(cfg.labelPatterns || [])];
  for (const p of packs) for (const lp of p.labelPatterns || []) labelSources.push(lp);
  const labelRegexes = dedup(labelSources).map((s) => { try { return new RegExp(s); } catch { return null; } }).filter(Boolean);

  const ignoreRegexes = (cfg.ignorePatterns || []).map((s) => { try { return new RegExp(s); } catch { return null; } }).filter(Boolean);
  const prose = proseOf(report);
  const tier1 = [];
  const tier2a = [];
  const tier2b = [];
  const tier3 = [];
  const seen = new Set();
  for (const tok of [...tokensOf(prose), ...braceTerms(report)]) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    const low = tok.toLowerCase();
    if (numericish(tok) || evidenceish(tok, ignoreRegexes)) continue;
    if (state.grounded.has(tok) || state.humanSaid.has(tok) || allow.has(low)) continue;
    if (partGrounded(tok, state, allow)) continue;
    if (definedInReport(report, tok)) continue;
    if (labelRegexes.some((re) => re.test(tok))) { tier1.push(tok); continue; }
    if (identLike(tok)) { (state.humanVisible.has(tok) ? tier2b : tier2a).push(tok); continue; }
    const f = state.internalFreq.get(low) || 0;
    const hf = state.humanFreq.get(low) || 0;
    if (f >= 3 && hf === 0 && f / (hf + 1) > 5) tier3.push([tok, f]);
  }
  tier3.sort((a, b) => b[1] - a[1]);

  const styleHits = applyStyle(report, packs, cfg.lang);
  const styleHard = styleHits.filter((h) => h.level === 'hard').length;
  const styleSoft = styleHits.filter((h) => h.level === 'soft').length;

  const undefinedCount = tier1.length + tier2a.length;
  const overBudget = undefinedCount > (cfg.budget ?? 2);
  const verdict = tier1.length > 0 || styleHard > 0 || overBudget ? 'FAIL' : 'PASS';

  return {
    verdict,
    tier1: dedup(tier1),
    tier2a: dedup(tier2a),
    tier2b: dedup(tier2b),
    tier3: tier3.slice(0, 15).map(([word, internal]) => ({ word, internal })),
    styleHits,
    styleHard,
    styleSoft,
    undefinedCount,
    overBudget,
    reportLen: String(report).length,
    lang: cfg.lang,
    mode: cfg.mode,
    config: cfg,
  };
}

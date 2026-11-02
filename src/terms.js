/**
 * Term extraction and gloss detection. Domain-neutral on purpose:
 * - tokens are "identifier-like" rather than a fixed list of label shapes;
 * - brace lists `{a, b}` count as terms even when the words look ordinary;
 * - a term is "defined" only when an explanation sits next to it.
 */
export const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const WORDTOK = /-{0,2}[A-Za-z0-9][A-Za-z0-9_.\-]{0,47}/g;
const BRACE = /\{([^{}]{1,140})\}/g;

/** All plausible term tokens in `text` (identifiers, flags, digit-leading ids, brace-list words). */
export function tokensOf(text, { braces = true } = {}) {
  const out = [];
  for (const m of text.matchAll(WORDTOK)) out.push(m[0]);
  if (braces) {
    for (const m of text.matchAll(BRACE)) {
      for (const p of m[1].split(/[\s,]+/)) {
        const t = p.trim().replace(/^[`"'(]+|[`"')]+$/g, '');
        if (t) out.push(t);
      }
    }
  }
  return out;
}

/** Does this token look like an identifier/code/technical name rather than a plain word? */
export function identLike(tok) {
  if (tok.length < 2 || tok.length > 48) return false;
  if (tok.startsWith('-')) return true;
  if (/[0-9]/.test(tok)) return true;
  if (/\.[A-Za-z]|\//.test(tok)) return true;
  if (/[A-Z]/.test(tok.slice(1))) return true;
  if (/^[A-Z]{2,6}$/.test(tok)) return true;
  return false;
}

/** Explanation immediately after a term:（...）, ，即..., : ..., i.e. ..., means ... */
export const GLOSS_AFTER = /^\s*(?:[（(][^）)]{0,60}[）)]|(?:，|,|—|--|:|：)?\s*(?:即|也就是|指的是|意为|代表|表示|i\.e\.|that is|means|refers to|as follows))/;
/** Explanation immediately before a term: 即... / means ... */
export const GLOSS_BEFORE = /(?:即|也就是|指的是|意为|代表|表示|i\.e\.|that is|means|refers to)\s*$/;

/** Is the term at [start,end) glossed in `text`? */
export function glossedAt(text, start, end) {
  return GLOSS_AFTER.test(text.slice(end, end + 80)) || GLOSS_BEFORE.test(text.slice(Math.max(0, start - 24), start));
}

/** Is `tok` defined inside the report itself (`M5 = ...`, `M5：...`, or followed by a gloss)? */
export function definedInReport(report, tok) {
  const esc = tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp('`?\\b' + esc + '\\b`?\\s*(?:=|＝|:|：|——|—)').test(report)) return true;
  const re = new RegExp('(?<![A-Za-z0-9\\-])' + esc + '(?![A-Za-z0-9])', 'g');
  let m;
  while ((m = re.exec(report))) {
    if (glossedAt(report, m.index, m.index + tok.length)) return true;
  }
  return false;
}

/** CJK runs, useful for language detection and character counting. */
export function cjkRuns(text) {
  return text.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) || [];
}

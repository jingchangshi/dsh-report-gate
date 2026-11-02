/**
 * Style checks (soft by default) driven by rule packs. The rule data is derived
 * from hai-simplified-technical (ASD-STE100 / 简化技术中文), adapted for reports:
 * vague words, wrapper verbs, marketing filler, fixed requirement words,
 * sentence length, "的" density and punctuation. Style hits are advisory.
 */
const LIMITS = { en: { desc: 25, step: 20 }, zh: { desc: 50, step: 40 } };

function clean(line) {
  return line
    .replace(/`[^`]*`/g, 'X')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/https?:\/\/\S+/g, 'X');
}
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
function detectLang(line, forced) {
  if (forced && forced !== 'auto') return forced;
  const cjk = (line.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const words = (line.match(/[A-Za-z]+/g) || []).length;
  if (cjk && cjk >= words) return 'zh';
  if (!cjk && words >= 3) return 'en';
  return null;
}
function strlen(sentence, lang) {
  const words = (sentence.match(/[A-Za-z0-9_.+'’-]+/g) || []).length;
  const cjk = (sentence.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  return words + (lang === 'zh' ? cjk : 0);
}
function splitSentences(body, lang) {
  const parts = lang === 'zh' ? body.split(/[。？！；]/) : body.split(/(?<=[.?!;])\s+/);
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** @returns {Array<{line:number,rule:string,level:'hard'|'soft',message:string,snippet:string}>} */
export function applyStyle(text, packs, forcedLang = 'auto') {
  const hits = [];
  if (!Array.isArray(packs) || packs.length === 0) return hits;
  const rules = [];
  const builtins = new Set();
  for (const p of packs) {
    for (const r of p.rules || []) rules.push(r);
    for (const b of p.builtins || []) builtins.add(b);
  }
  const lines = String(text).replace(/\r/g, '').split('\n');
  let inFence = false;
  lines.forEach((raw, idx) => {
    const n = idx + 1;
    if (raw.trimStart().startsWith('```') || raw.trimStart().startsWith('~~~')) { inFence = !inFence; return; }
    if (inFence) return;
    if (/^\s*\|?\s*:?-{3,}/.test(raw)) return;
    if (raw.trimStart().startsWith('<!--')) return;
    const line = clean(raw);
    const lang = detectLang(line, forcedLang);
    if (!lang) return;
    const bare = line.replace(/"[^"]{1,40}"|“[^”]{1,40}”|「[^」]{1,40}」/g, '""');
    for (const r of rules) {
      if (r.langs && !r.langs.includes(lang)) continue;
      let re;
      const flags = (r.flags || '').includes('g') ? r.flags : (r.flags || '') + 'g';
      try { re = new RegExp(r.pattern, flags); } catch { continue; }
      let m;
      while ((m = re.exec(bare))) {
        hits.push({ line: n, rule: r.id, level: r.level || 'soft', message: r.message || '', snippet: m[0].slice(0, 40) });
        if (re.lastIndex === m.index) re.lastIndex++;
      }
    }
    if (builtins.has('sentenceLength')) {
      const isStep = /^\s*\d+[.、)]\s/.test(raw);
      const body = raw.replace(/^\s*(?:[-*+]|\d+[.、)]|#+|>)\s*/, '');
      const lim = (lang === 'zh' ? LIMITS.zh : LIMITS.en)[isStep ? 'step' : 'desc'];
      for (const s of splitSentences(body, lang)) {
        const k = strlen(s, lang);
        if (k > lim) hits.push({ line: n, rule: isStep ? '5.4' : '6.3', level: 'soft', message: `${k} ${lang === 'zh' ? '字' : 'words'} > ${lim}`, snippet: s.slice(0, 40) });
      }
    }
    if (builtins.has('deCount') && lang === 'zh') {
      for (const clause of line.split(/[，。；：、？！,;:]/)) {
        const c = (clause.match(/的/g) || []).length;
        if (c > 2) hits.push({ line: n, rule: '2.1', level: 'soft', message: '一个分句超过两个“的”，考虑拆开', snippet: clause.trim().slice(0, 30) });
      }
    }
    if (builtins.has('punctSpacing')) {
      if (lang === 'zh' && /[\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fff]/.test(line)) hits.push({ line: n, rule: '8.3', level: 'soft', message: '中文与英文/数字之间缺空格', snippet: '' });
      if (lang === 'en' && /[，。；：？！（）、]/.test(line)) hits.push({ line: n, rule: '8.1', level: 'hard', message: '英文文本里出现全角标点', snippet: '' });
      if (/\d\s*[~～]\s*\d/.test(line)) hits.push({ line: n, rule: '8.6', level: 'soft', message: '范围用“–”或“到”，不用“~”', snippet: '' });
    }
  });
  return hits;
}

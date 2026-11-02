/**
 * Configuration: defaults, a tiny YAML reader for `.dsh/report-readability.yml`,
 * JSON rule packs, and merge/discovery.
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONFIG = {
  mode: 'advisory', // 'advisory' | 'enforce'
  lang: 'auto', // 'auto' | 'zh' | 'en'
  budget: 2, // max undefined identifiers tolerated in enforce mode
  labelPatterns: ['(?<![A-Za-z0-9\\-])[A-Za-z]{1,2}\\d{1,2}(?![A-Za-z0-9])'],
  allowlist: [],
  packs: ['generic', 'ste-zh', 'ste-en'],
  semantic: { enabled: false, model: null },
  retryLimit: 2,
};

const ROOT_PACKS = new URL('../packs/', import.meta.url);
const CONFIG_FILES = ['.dsh/report-readability.yml', '.dsh/report-readability.yaml', '.dsh/report-readability.json'];

/** Parse the tiny YAML subset used by our config: scalars, `- ` lists, one nesting level, inline [a, b]. */
export function parseSimpleYaml(text) {
  const toks = [];
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const noComment = raw.replace(/\s+#.*$/, '');
    if (!noComment.trim() || noComment.trim().startsWith('#')) continue;
    toks.push({ indent: raw.match(/^\s*/)[0].length, content: noComment.trim() });
  }
  let i = 0;
  const kv = (s) => {
    const k = s.indexOf(':');
    if (k < 0) return null;
    return [s.slice(0, k).trim(), s.slice(k + 1).trim()];
  };
  const scalar = (v) => {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '') return null;
    if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map((x) => scalar(x.trim())).filter((x) => x !== null);
    if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
    return v.replace(/^['"]|['"]$/g, '');
  };
  function block(indent) {
    if (i >= toks.length) return null;
    if (toks[i].content.startsWith('- ')) {
      const arr = [];
      while (i < toks.length && toks[i].indent === indent && toks[i].content.startsWith('- ')) {
        const rest = toks[i].content.slice(2).trim();
        i++;
        const pair = kv(rest);
        if (pair && rest !== '' && !/^[^:]+:\s*$/.test(rest) === false) { /* noop */ }
        if (pair) {
          const obj = {};
          const [k, v] = pair;
          if (v === '') obj[k] = i < toks.length && toks[i].indent > indent ? block(toks[i].indent) : null;
          else obj[k] = scalar(v);
          while (i < toks.length && toks[i].indent > indent && !toks[i].content.startsWith('- ')) {
            const p2 = kv(toks[i].content);
            i++;
            if (!p2) break;
            obj[p2[0]] = p2[1] === '' ? (i < toks.length && toks[i].indent > indent ? block(toks[i].indent) : null) : scalar(p2[1]);
          }
          arr.push(obj);
        } else {
          arr.push(scalar(rest));
        }
      }
      return arr;
    }
    const obj = {};
    while (i < toks.length && toks[i].indent === indent && !toks[i].content.startsWith('- ')) {
      const pair = kv(toks[i].content);
      i++;
      if (!pair) break;
      const [k, v] = pair;
      obj[k] = v === '' ? (i < toks.length && toks[i].indent > indent ? block(toks[i].indent) : null) : scalar(v);
    }
    return obj;
  }
  if (!toks.length) return {};
  return block(toks[0].indent);
}

/** Read a JSON rule pack by name from packs/. */
export function loadPack(name, packsDir = ROOT_PACKS) {
  const file = new URL(`${name}.json`, packsDir);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Read and resolve every pack named in config.packs. */
export function loadPacks(names, packsDir = ROOT_PACKS) {
  return (names || []).map((n) => {
    try { return loadPack(n, packsDir); } catch { return null; }
  }).filter(Boolean);
}

/** Find `.dsh/report-readability.{yml,yaml,json}` walking up from `startDir`. */
export function loadConfigFromDir(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    for (const rel of CONFIG_FILES) {
      const file = path.join(dir, rel);
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        return rel.endsWith('.json') ? JSON.parse(raw) : parseSimpleYaml(raw);
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return {};
    dir = parent;
  }
}

/** Deep-merge config overlays. `allowlist` concatenates; other arrays replace. */
export function mergeConfig(base, ...overlays) {
  const out = { ...base };
  for (const ov of overlays) {
    if (!ov || typeof ov !== 'object') continue;
    for (const [k, v] of Object.entries(ov)) {
      if (k === 'allowlist' && Array.isArray(v)) out.allowlist = [...new Set([...(out.allowlist || []), ...v])];
      else if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = mergeConfig(out[k], v);
      else out[k] = v;
    }
  }
  return out;
}

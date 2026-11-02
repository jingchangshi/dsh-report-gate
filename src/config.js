/**
 * Configuration: defaults, a tiny YAML reader for `.dsh/report-readability.yml`,
 * JSON rule packs, and merge/discovery.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

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

/** Parse a YAML configuration document. */
export function parseSimpleYaml(text) {
  const value = parseYaml(text);
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('report-gate: configuration must be a mapping');
  return value;
}

/** Read a JSON rule pack by name from packs/. */
export function loadPack(name, packsDir = ROOT_PACKS) {
  const file = new URL(`${name}.json`, packsDir);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Read and resolve every pack named in config.packs. */
export function loadPacks(names, packsDir = ROOT_PACKS) {
  return (names || []).map((name) => {
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error(`report-gate: invalid pack name ${String(name)}`);
    try { return loadPack(name, packsDir); } catch (error) { throw new Error(`report-gate: cannot load pack ${name}`, { cause: error }); }
  });
}

/** Validate effective configuration before checking a report. */
export function validateConfig(config) {
  if (!['advisory', 'enforce'].includes(config.mode)) throw new Error('report-gate: mode must be advisory or enforce');
  if (!['auto', 'zh', 'en'].includes(config.lang)) throw new Error('report-gate: lang must be auto, zh or en');
  for (const key of ['budget', 'retryLimit']) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0) throw new Error(`report-gate: ${key} must be a nonnegative integer`);
  }
  for (const key of ['packs', 'allowlist', 'labelPatterns']) {
    if (!Array.isArray(config[key]) || config[key].some((item) => typeof item !== 'string')) throw new Error(`report-gate: ${key} must be an array of strings`);
  }
  for (const pattern of config.labelPatterns) new RegExp(pattern);
  if (config.semantic?.enabled) throw new Error('report-gate: semantic review is not implemented');
  return config;
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

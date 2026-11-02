#!/usr/bin/env node
/** Standalone CLI: report-gate check <session.jsonl|.zstd> [--config FILE] [--lang auto|zh|en] [--json] */
import fs from 'node:fs';
import { loadSession } from './session.js';
import { lastAssistantText, textOf } from './events.js';
import { checkReport } from './engine.js';
import { formatResult } from './report.js';
import { loadConfigFromDir, loadPacks, mergeConfig, DEFAULT_CONFIG, parseSimpleYaml, validateConfig } from './config.js';

function parseArgs(argv) {
  const out = { _: [], json: false, config: null, lang: null, mode: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--config') out.config = argv[++i];
    else if (a === '--lang') out.lang = argv[++i];
    else if (a === '--mode') out.mode = argv[++i];
    else if (a === '-h' || a === '--help') out.help = true;
    else out._.push(a);
  }
  return out;
}

function readConfigFile(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return file.endsWith('.json') ? JSON.parse(raw) : parseSimpleYaml(raw);
}

function usage() {
  return [
    'Usage:',
    '  report-gate check <session.jsonl|.zstd> [--config FILE] [--lang auto|zh|en] [--mode advisory|enforce] [--json]',
    '',
    'Exit: 0 = PASS, 1 = FAIL, 2 = usage/error.',
  ].join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length === 0) { console.log(usage()); return 0; }
  const cmd = args._[0];
  if (cmd !== 'check') { console.error(`unknown command: ${cmd}\n${usage()}`); return 2; }
  const sessionPath = args._[1];
  if (!sessionPath) { console.error(usage()); return 2; }
  let events;
  try { events = loadSession(sessionPath); } catch (e) { console.error(`cannot read session: ${e.message}`); return 2; }
  const target = lastAssistantText(events);
  if (!target) { console.error('no assistant text found in session'); return 2; }
  let config, packs;
  try {
    const fileCfg = args.config ? readConfigFile(args.config) : loadConfigFromDir(process.cwd());
    const overrides = {};
    if (args.lang) overrides.lang = args.lang;
    if (args.mode) overrides.mode = args.mode;
    config = validateConfig(mergeConfig(DEFAULT_CONFIG, fileCfg, overrides));
    packs = loadPacks(config.packs);
  } catch (error) {
    console.error(`invalid configuration: ${error.message}`);
    return 2;
  }
  const result = checkReport(textOf(target), { events, reportSeq: target.seq, config, packs });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(formatResult(result));
  return result.verdict === 'FAIL' ? 1 : 0;
}

process.exit(main());

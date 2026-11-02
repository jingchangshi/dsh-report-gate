/** Load a DSH session log (v4 JSONL, optionally .zstd) into an array of events. */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export function loadSession(filePath) {
  let text;
  if (String(filePath).endsWith('.zstd')) {
    text = execFileSync('zstd', ['-dc', filePath], { encoding: 'utf8', maxBuffer: 1 << 30 });
  } else {
    text = fs.readFileSync(filePath, 'utf8');
  }
  const events = [];
  for (const line of text.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const e = JSON.parse(s);
      if (e && e.type) events.push(e);
    } catch { /* skip malformed line */ }
  }
  return events;
}

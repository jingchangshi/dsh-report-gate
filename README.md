# dsh-report-gate

A **readability gate for AI task reports**: catch undefined internal labels (`M5`, `D2`, `S0` …) and jargon that only ever appeared in AI↔AI traffic (`policy`, `eligibility` …) before a report reaches a human. Runs as a **DSH plugin** or as a **standalone CLI** over session logs.

See [README.zh.md](README.zh.md) for the full Chinese guide (primary). Quick start:

```bash
node src/cli.js check /path/to/session.jsonl.zstd --lang zh   # 0=PASS 1=FAIL
node --test test/*.test.js
```

Design: channel classification (human vs backstage, from `source.kind`) + a grounding ledger (what this human was actually shown) + tiered checks (Tier-1 internal labels = hard; Tier-2 identifiers = advisory; Tier-3 ordinary words = semantic candidates) + config-driven, domain-neutral rule packs. Defaults to `advisory` and fails open. Enforcement hooks `agent/turn-stopping` (steer a rewrite) and offers `/report`; subagent sessions are skipped.

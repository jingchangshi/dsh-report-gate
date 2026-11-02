# Design notes

## Why this exists
A real DSH Agent-Team session ended with a report full of labels (`M5`, `S0`) and backstage terms (`policy`, `eligibility`) the human never saw. The mechanism-level causes: (1) no record of what the human has been told; (2) no pre-delivery readability check; (3) human vs AI messages share one inbox. Prompt instructions alone cannot fix (1) and (2).

## Core invariants
1. **Grounding is computed, not assumed.** The ledger is built from the durable event log's human channel only (`source.kind === 'user'` plus non-empty assistant text), up to the report. Never from a compacted view.
2. **Seen ≠ explained.** A term counts as known only if the human typed it or it was glossed next to its occurrence.
3. **Domain-neutral engine.** No domain words in code. Label shapes, allowlists and style rules are data (packs + per-repo config).
4. **Tiered, fail-open enforcement.** Tier-1 labels are hard; identifiers are advisory; ordinary words are candidates. Default `advisory`; the DSH adapter swallows all errors (a throwing `agent/turn-stopping` listener would abort the turn).
5. **Human-facing only.** Subagent sessions and backstage messages are skipped.

## Why turn-stopping + a report tool, not turn-stopping alone
`assistant/message` is appended inside the step, before `agent/turn-stopping` fires — so a turn-stopping steer guarantees the turn ends with a readable version but cannot stop the human glimpsing an earlier draft. For strict "never show a bad draft", route the report through a validated deliverable tool (content check inside the tool); keep the turn-stopping steer as the presence enforcer.

## Known limits
- Tier-3 ordinary words are a frequency proxy, not a semantic decision; wire `semantic.model` (a clean-context newcomer reader) for low-frequency jargon.
- Tokenization is Latin-identifier oriented; pure-CJK coinages rely on style/allownance.
- The DSH adapter is written against optional/structural APIs and must be reconciled with the target DSH version.

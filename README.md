# dsh-report-gate

DSH plugin and standalone CLI for checking AI task reports for potentially unexplained labels, terms, and writing-style issues. Findings are heuristic and do not establish factual correctness.

Install in the Web profile with `dsh plugin --profile web add github:jingchangshi/dsh-report-gate`. After a top-level agent turn, `/report` shows the most recent automatic check. On an agent without an in-memory check, it checks the most recent assistant message instead. The default mode is advisory. Opt-in `enforce` requests a bounded rewrite **after the original message has been published**, so it is not a pre-publication gate.

Configuration is discovered per session working directory from `.dsh/report-readability.yml`. See [README.zh.md](README.zh.md) for installation, configuration, and limitations, and [DESIGN.md](docs/DESIGN.md) for implementation notes.

```sh
npm ci
npm test
node src/cli.js check /path/to/session.jsonl.zstd --lang zh
```

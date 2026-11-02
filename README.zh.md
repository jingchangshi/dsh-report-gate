# dsh-report-gate

**给"AI 任务汇报"加一道人类可读性闸门**：在汇报到达人之前，抓出读者看不懂的内部代号（M5、D2、S0…）和只在 AI 之间出现过、从未对人解释的术语（policy、eligibility…）。可作为 **DSH 插件**运行，也有**独立 CLI** 可直接检查会话日志。

## 它解决什么问题

一次多智能体（Lead + 架构/评审/子代理）完成的编译任务，最后给人类的总结里满是内部代号和后台术语，但人从未参与那些 AI 对话，于是读不懂。根因不是"模型没写清楚"，而是系统没有：①"人已被告知哪些词"的清单；②交付前的可读性检查；③人与 AI 消息的通道区分。本插件把这三件事落成机制。

## 设计：引擎 + 规则包 + 每仓配置

```
会话事件 ──► 通道判定 ──► 已解释词清单 ─┐
(human vs backstage)                  ├─► 分档检查 ─► 结论(FAIL/PASS) ─► CLI 报告 / DSH 拦截
规则包(generic/ste-zh/ste-en/mlir) ───┘
```

- **通道判定**：DSH 在每个 user 消息上记录了来源（`source.kind`）。`user` = 人自己说的；`agent-message`（队友）、`subagent-settled`（子任务通知）、`tool/result`、系统提示 = 后台。只有"人自己说的 + 助手正文"算人类可见通道。
- **已解释词清单**：从**原始日志**（不是压缩后的视图）里，收集"人亲口说过的词"和"紧邻处带解释的词"。**见过 ≠ 已解释**：一闪而过没解释的词仍算未解释。
- **分档检查**：
  - **Tier-1 内部代号**（形如 `[A-Za-z]{1,2}\d{1,2}`，如 M5/D2/S0）：人没说过、且报告内未就地定义的 → **可硬拦**。
  - **Tier-2 其它标识符**（如 `runHIVMCCompileA5`、`920r1`）：仅提示，建议进附录名词表。
  - **Tier-3 普通词**（如 policy/eligibility）：用"后台高频 × 前台为零"的比例粗筛成候选，最终交给语义判断。
- **两种模式**：`advisory`（只报告、不拦）与 `enforce`（不过则退回重写）。默认 advisory，避免误伤。
- **引擎零领域词**：代码里不写死任何 `f16/M5/cc1` 这类词；领域词表与规则都在 `packs/` 和每仓配置里。因此**可移植**、可发布、换仓库只需加一份配置。

## 快速开始（独立 CLI，无需装进 DSH）

```bash
# 检查一个会话日志（v4 JSONL 或 .zstd），打印人类可读报告
node src/cli.js check /path/to/session.v4.jsonl.zstd --lang zh
# 机器可读 + 指定每仓配置
node src/cli.js check session.jsonl --config examples/.dsh/report-readability.yml --json
# 退出码：0=PASS，1=FAIL，2=用法错误
```

对本仓库分析过的真实会话运行，它会列出 14 个内部代号（M5–M8、S0–S5、B5、D1–D3），并在 Tier-3 里给出 policy/eligibility/bundles。

## 作为 DSH 插件安装与使用

这是 `dsh.bundle.patch` 形式的插件包（与 `experimental/auto-review` 同构）。

**一次性安装（两种粒度）**：
```bash
# A. 装到整个 profile：之后该 profile 下新会话自动生效
pnpm dsh plugin --profile web add /path/to/dsh-report-gate

# B. 只给某类会话：把 report-gate 行加入对应 agent preset 的 plugins 列表
```

**会话里怎么用**：
- **自动**：插件在 `agent/turn-stopping` 检查本轮"面向人的结束语"；`mode: enforce` 时若不过 → 向模型退回重写。用户零操作。
- **手动**：`/report` 命令检查当前汇报。
- 只对**顶层、面向人**的轮次生效；子代理（`origin=subagent`）自动跳过。
- 改动配置/preset **只影响之后创建的会话**；在跑的会话要重开。

> 适配层在 `src/dsh/index.js`，用容错结构对接 `agent/turn-stopping`、`agent.steer`、`ctx.commands`。若你的 DSH 版本 API 不同，只需调整该文件里的少量访问器；核心引擎与规则包不依赖 DSH。

## 配置参考（`<repo>/.dsh/report-readability.yml`）

```yaml
mode: advisory     # advisory | enforce
lang: auto         # auto | zh | en
budget: 2          # 允许的未解释标识符数量，超过才 FAIL（enforce 时拦截）
packs: [generic, ste-zh, ste-en, mlir]
allowlist: [Triton, Cube, BarAll]   # 叠加项目专用词
semantic: { enabled: false, model: null }   # 预留：交给新读者模型判普通词
retryLimit: 2
```

## 规则包

| 包 | 作用 |
|---|---|
| `generic` | 语言无关的默认：代号正则 + 语言/硬件原语白名单（f16/i32/x86/cc1/L2…） |
| `ste-zh` | 简化技术中文（改编自 hai-simplified-technical / ASD-STE100）：含糊词、包装动词、套话、句长、的字密度、标点 |
| `ste-en` | 同一体系的英文子集：vague words、wrapper verbs、filler、sentence length |
| `mlir` | 可选：MLIR/硬件专有词扩展白名单 |

> `ste-zh` / `ste-en` 的规则体系参考了 [hai-simplified-technical](https://github.com/hylarucoder/hai-stack/tree/main/skills/hai-simplified-technical)（ASD-STE100 简化技术英语中文版），针对"任务汇报"做了裁剪与降级（意见性规则默认 soft，只有真正含糊/包装动词才 hard）。

## 可移植性与边界

- **不绑服务器**：纯 ESM 包，零运行时依赖；引擎不含任何领域词；换仓库只需一份 `.dsh/report-readability.yml`。
- **失败开放**：advisory 为默认；DSH 适配层所有异常都吞掉并记录，绝不因本插件中断会话。
- **已知局限**：Tier-3 普通词靠频率粗筛 + 语义判断（低频词如 eligibility 可能漏，需 `semantic` 接新读者模型）；分词以拉丁标识符为主，纯中文新造词靠风格/词表；DSH 适配层需按你的版本核对 API。

## 开发与测试

```bash
node --test test/*.test.js     # 20 个测试：terms/ledger/engine/style/config/cli
npm run demo                   # 在样例会话上跑 CLI
```

目录：`src/`（events/terms/ledger/style/engine/config/report/session/cli + dsh 适配层）、`packs/`、`test/`、`examples/.dsh/`、`docs/DESIGN.md`。

## 与"只靠提示词"的区别

提示词能让模型"尽量写清楚"，但**不能**：①知道这个特定人已知哪些词；②在交付前强制拦截。本插件用"已解释词清单 + 分档检查 + 交付前拦截"补上这两点——提示词是第 0 层，本插件是机制层。

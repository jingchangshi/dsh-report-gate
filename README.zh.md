# dsh-report-gate

DSH 插件检查任务报告中可能难以理解的内部代号和术语，并提供 `/report` 查询结果。它还提供独立 CLI，可以检查已保存的 DSH 会话日志。检查结果是启发式提示，不能证明一份报告对所有读者都易懂。

## 安装

需要 Node.js 22.19 及以上的 22.x 版本，或 Node.js 24 及以上版本。将插件安装到 Web profile：

```sh
dsh plugin --profile web add github:jingchangshi/dsh-report-gate
```

也可以使用已安装的 DSH 源码仓库执行 `pnpm dsh plugin ...`。安装指定版本时，可以在仓库地址后添加 `#<commit>`。`web` profile 支持加载安装的插件；若插件尚未加载，请重启 Web 服务并打开会话。

## 在会话中使用

插件在顶层 Agent 的每轮结束时检查该轮最后一条助手回复，不处理子代理。默认 `advisory` 模式只检查，不要求模型重写。输入：

```text
/report
```

命令显示当前 Agent 最近一次自动检查的轮次、消息序号和结果。结果保存在内存中：DSH 重启或 Agent 被重新创建后，`/report` 会改为手动检查该会话最近一条助手回复，并在输出中说明这是手动检查。服务日志也记录自动检查的会话 ID、轮次和结果；不记录报告全文。

`enforce` 模式在检查未通过时让 Agent 追加重写，重试次数受 `retryLimit` 限制。**该检查发生在回复已经发布之后**：用户可能先看到原回复，再看到重写。达到重试上限后，`/report` 显示该状态；插件不会无限重试。它不是交付前缓冲或发布门禁。

## 配置

在会话工作目录或其上级目录放置 `.dsh/report-readability.yml`，例如：

```yaml
mode: advisory           # advisory 或 enforce
lang: auto               # auto、zh 或 en
budget: 2                # 未解释标识符的提示预算
retryLimit: 2            # 每轮最多重写次数
packs: [generic, ste-zh, ste-en, mlir]
allowlist: [Triton, Cube]
ignorePatterns: ['^(CMake|IR|AscendNPU-IR)$']   # 可选：证据型词，不参与检查
```

`labelPatterns` 默认只认**大写开头**的短代号（`M5`、`S2`），避免把 `s4`、`v2` 这类代码标识符当成内部代号；需要小写代号时在配置里改 `labelPatterns`。

每次检查都按该会话当前工作目录加载配置。无文件时使用默认值。配置格式错误、规则包不存在或检查失败时，自动检查记入服务日志，`/report` 返回错误；不会中断原任务。`semantic.enabled` 是预留配置，当前不支持开启，开启时会报告错误。

## 检查内容与限制

- **内部代号**：人未使用过、报告中也未定义的代号会列为第一类发现。
- **其他标识符（Tier-2）**：仅供参考，**不影响 PASS/FAIL、不会触发重写**。行内代码、文件名、版本号、环境变量、占位符等证据型内容会被跳过。
- **普通词（Tier-3）**：后台高频、前台未出现的词仅作为候选，当前没有接入独立语义模型，可能漏报或误报。
- **自动调用**：插件在每轮结束时自动运行；`advisory` 只记录，`enforce` 才可能重写。自动结果不会显示在聊天里，用 `/report` 查看。
- **风格**：中英文规则包借鉴 `hai-simplified-technical`。部分风格规则是硬规则，会影响 FAIL；建议先使用默认的提示模式观察实际效果。

术语识别、首次解释判断和语言分词都采用启发式方法；引用、跨语言表达、代码片段、普通缩写可能导致误判。`/report` 的 FAIL 不表示技术结论错误，也不保证 PASS 的报告一定可读。

## 独立 CLI 与开发

```sh
npm ci
npm test
node src/cli.js check /path/to/session.v4.jsonl.zstd --lang zh
```

`.zstd` 日志需要系统上的 `zstd` 命令。CLI 输出 PASS 时退出码为 0，FAIL 为 1，输入或配置错误为 2。具体设计见 [DESIGN.md](docs/DESIGN.md)。

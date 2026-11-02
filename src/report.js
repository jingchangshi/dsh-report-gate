/** Render a check result as a short, human-readable Markdown report. */
export function formatResult(r) {
  const L = [];
  L.push(`# 报告可读性检查：${r.verdict}`);
  L.push('');
  L.push(`- 报告长度：${r.reportLen} 字符；模式：${r.mode}`);
  L.push(`- Tier-1 内部代号（硬拦）：${r.tier1.length}`);
  L.push(`- Tier-2 未解释标识符（提示）：${r.tier2a.length + r.tier2b.length}`);
  L.push(`- Tier-3 普通词候选（语义）：${r.tier3.length}`);
  L.push(`- 风格问题：hard ${r.styleHard} / soft ${r.styleSoft}`);
  L.push('');
  if (r.tier1.length) {
    L.push('## Tier-1：报告里出现、人从未用过、且报告内未定义的代号');
    for (const t of r.tier1) L.push(`- \`${t}\``);
    L.push('');
    L.push('→ 就地解释（如 `M5 = 第 5 条实测`）或从摘要里删掉。');
    L.push('');
  }
  if (r.tier2a.length) {
    L.push('## Tier-2a：其它标识符（仅供参考，不影响 PASS/FAIL）');
    for (const t of r.tier2a.slice(0, 20)) L.push(`- \`${t}\``);
    if (r.tier2a.length > 20) L.push(`- …（还有 ${r.tier2a.length - 20} 个）`);
    L.push('');
  }
  if (r.tier2b.length) {
    L.push('## Tier-2b：见过但未见解释的标识符（仅供参考，不影响 PASS/FAIL）');
    for (const t of r.tier2b.slice(0, 20)) L.push(`- \`${t}\``);
    if (r.tier2b.length > 20) L.push(`- …（还有 ${r.tier2b.length - 20} 个）`);
    L.push('');
  }
  if (r.tier3.length) {
    L.push('## Tier-3：人从未用过、后台高频出现的普通词（需语义判断）');
    for (const x of r.tier3) L.push(`- ${x.word}（后台 ${x.internal} 次）`);
    L.push('');
  }
  if (r.styleHits.length) {
    L.push('## 风格问题（soft 为主，供参考）');
    for (const h of r.styleHits.slice(0, 20)) L.push(`- 第 ${h.line} 行 [${h.rule} ${h.level}] ${h.message}${h.snippet ? `：${h.snippet}` : ''}`);
    L.push('');
  }
  if (r.verdict === 'PASS') L.push('结果：通过（未发现未定义代号；风格问题仅为建议）。');
  return L.join('\n');
}

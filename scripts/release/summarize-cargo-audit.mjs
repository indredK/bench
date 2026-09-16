/**
 * 把 cargo audit --json 的输出整理成人可读的 summary（SEC01）。
 *
 * 背景：cargo audit 将 unsound/unmaintained 归入 warning，退出码仍为 0 ——
 * "绿色"会被误读成"零告警"。安全 workflow 调用本脚本把 informational
 * warnings 显式写进 GITHUB_STEP_SUMMARY；已知且已书面接受的风险
 * （docs/security/rust-advisories.md）标注为 accepted，未记录的新告警
 * 提示需要立项评估。
 *
 * 用法: node summarize-cargo-audit.mjs <audit.json>
 * 输出: Markdown（追加到 $GITHUB_STEP_SUMMARY）
 */
import { readFileSync } from "node:fs"

// 已书面接受的风险（docs/security/rust-advisories.md）：
// - RUSTSEC-2024-0429 glib（SEC01 专条，Linux 发布前置）
// - unmaintained 类（paste/proc-macro-error/unic-*）在记录文件"附带记录"段整体登记
const ACCEPTED = new Set(["RUSTSEC-2024-0429"])
const UNMAINTAINED_KINDS = new Set(["unmaintained"])

const file = process.argv[2]
if (!file) {
  console.error("usage: summarize-cargo-audit.mjs <audit.json>")
  process.exit(1)
}

let audit
try {
  audit = JSON.parse(readFileSync(file, "utf8"))
} catch (error) {
  console.log("### cargo audit summary")
  console.log()
  console.log(`⚠️ 无法解析 audit 输出：${error.message}`)
  process.exit(0)
}

const lines = ["### cargo audit summary", ""]
const vulns = audit?.vulnerabilities?.list ?? []
lines.push(`- vulnerabilities: **${vulns.length}**`)
for (const v of vulns) {
  lines.push(
    `  - ${v.package?.name} ${v.package?.version} — ${v.advisory?.id} (${v.advisory?.title ?? ""})`,
  )
}

const warnings = audit?.warnings ?? {}
const byKind = (kind) => warnings[kind] ?? []
const informational = [...byKind("informational"), ...byKind("unsound"), ...byKind("unmaintained")]
lines.push(
  `- informational warnings: **${informational.length}**（unsound / unmaintained 不影响退出码，但必须显式可见）`,
)

const accepted = []
const unrecorded = []
for (const w of informational) {
  const id = w?.advisory?.id ?? "unknown"
  const pkg = `${w?.package?.name ?? "?"} ${w?.package?.version ?? "?"}`
  const entry = `| ${id} | ${pkg} | ${w?.advisory?.title ?? ""} |`
  const kind = w?.kind ?? ""
  if (ACCEPTED.has(id) || UNMAINTAINED_KINDS.has(kind)) accepted.push(entry)
  else unrecorded.push(entry)
}

if (informational.length > 0) {
  lines.push("")
  lines.push("| advisory | package | title |")
  lines.push("| --- | --- | --- |")
  for (const entry of accepted) lines.push(`| ${entry.slice(2, -2)} ✅ accepted |`)
  for (const entry of unrecorded) lines.push(`| ${entry.slice(2, -2)} ⚠️ 未登记 |`)
  lines.push("")
  lines.push(
    "accepted 条目的期限与条件见 `docs/security/rust-advisories.md`；未登记告警需要新开风险评估。",
  )
}

console.log(lines.join("\n"))

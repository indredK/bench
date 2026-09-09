/**
 * GitHub Actions workflow hygiene scanner (zero-dependency, text-level).
 *
 * 与 check-ci-platforms.mjs 同族：CI 工作流的静态守卫，配合
 * `pnpm run check:ci-platforms`（平台策略）形成 workflow 改动的完整门禁。
 *
 * 背景：workflow 以 tag 引用第三方 action 存在被重指向的供应链风险
 * （tj-actions/changed-files CVE-2025-30066）；run: 块内直接插值
 * 不可信上下文（github.event.* / inputs.*）构成模板注入向量；
 * 缺 concurrency/timeout 会浪费或耗尽双平台 runner 分钟数。
 *
 * 规则（全部为强制，任一命中即 exit 1）：
 *   R1 unpinned-uses   — `uses:` 引用第三方 action 必须锚定完整 40 位
 *                        commit SHA（本地 `./` 路径与 docker:// 豁免）。
 *   R2 template-injection — `run:` 块内禁止直接插值不可信上下文
 *                        （github.event.* / inputs.* / github.head_ref /
 *                        github.ref_name）；必须经 step/job env 传递。
 *   R3 job-timeout     — 每个 job 必须显式 `timeout-minutes:`（默认 6h
 *                        上限会把挂死的构建/测试烧满）。
 *   R4 concurrency     — 含 push/pull_request/workflow_dispatch 触发器的
 *                        workflow 必须有顶层 `concurrency:`（取消同 ref
 *                        旧 run）。
 *   R5 permissions     — 必须显式声明顶层 `permissions:`（最小权限基线）。
 *
 * Exit code 1 if any violation is found, 0 otherwise.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const workflowsDir = path.join(rootDir, ".github", "workflows")

const FULL_SHA_RE = /^[0-9a-f]{40}$/
const UNSAFE_CONTEXT_RE =
  /\$\{\{\s*(github\.event\.|inputs\.|github\.head_ref\b|github\.ref_name\b)/
const BLOCK_SCALARS = new Set(["|", ">", "|-", ">-", "|+", ">+"])
const TRIGGERS_REQUIRING_CONCURRENCY = ["push", "pull_request", "workflow_dispatch"]

function findWorkflowHygieneViolations(file, content) {
  const lines = content.split("\n")
  const violations = []
  const report = (rule, line, message) => violations.push({ rule, file, line, message })

  // --- R4 / R5: 顶层 concurrency 与 permissions（静态结构检查） ---

  const hasConcurrency = lines.some((line) => /^concurrency:\s*(?:#.*)?$/.test(line))
  if (!hasConcurrency) {
    report(
      "R4",
      1,
      "缺少顶层 concurrency: — 加 `concurrency: { group: ..., cancel-in-progress: ... }` 取消同 ref 旧 run",
    )
  }

  const hasPermissions = lines.some((line) => /^permissions:\s*(?:#.*)?$/.test(line))
  if (!hasPermissions) {
    report("R5", 1, "缺少顶层 permissions: — 显式声明最小权限基线（写权限收到具体 job 级）")
  }

  // --- R4 补充：只有 schedule 触发时可豁免 concurrency ---

  const onMatch = content.match(/^on:\s*(?:#.*)?$/m)
  if (!hasConcurrency && onMatch) {
    // 没有任何需要取消语义的触发器时豁免（当前仓库不存在这种 workflow）。
    const triggers = TRIGGERS_REQUIRING_CONCURRENCY.filter((t) =>
      new RegExp(`^\\s{2,}${t}:`, "m").test(content),
    )
    if (triggers.length === 0) {
      // schedule-only：移除 R4。
      for (let index = violations.length - 1; index >= 0; index--) {
        if (violations[index].rule === "R4") violations.splice(index, 1)
      }
    }
  }

  // --- R1 / R2: 逐行扫描 ---

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    // R1: uses 必须锚定完整 commit SHA
    const usesMatch = line.match(/^\s*(?:-\s+)?uses:\s*(\S+)/)
    if (usesMatch) {
      const reference = usesMatch[1]
      const isLocal = reference.startsWith("./")
      const isDocker = reference.startsWith("docker://")
      if (!isLocal && !isDocker) {
        const atIndex = reference.lastIndexOf("@")
        const version = atIndex >= 0 ? reference.slice(atIndex + 1) : ""
        if (!FULL_SHA_RE.test(version)) {
          report(
            "R1",
            index + 1,
            `uses 未锚定完整 commit SHA: ${reference} — 改为 \`@<40位SHA> # <版本>\`（tag 可被重指向，存在供应链风险）`,
          )
        }
      }
      continue
    }

    // R2: run: 块内的不可信上下文插值
    const runMatch = line.match(/^(\s*)(?:-\s+)?run:\s*(.*)$/)
    if (!runMatch) continue
    const runIndent = runMatch[1].length
    const runRest = runMatch[2].trim()

    if (BLOCK_SCALARS.has(runRest)) {
      // 块式 run：扫描到缩进 <= run 键缩进的第一条非空行为止。
      let cursor = index + 1
      for (; cursor < lines.length; cursor++) {
        const blockLine = lines[cursor]
        if (blockLine.trim() === "") continue
        const blockIndent = blockLine.length - blockLine.trimStart().length
        if (blockIndent <= runIndent) break
        if (UNSAFE_CONTEXT_RE.test(blockLine)) {
          report(
            "R2",
            cursor + 1,
            "run 块内直接插值不可信上下文 — 改经 step/job `env:` 传入 shell（防模板注入）",
          )
        }
      }
      index = cursor - 1
    } else if (runRest && UNSAFE_CONTEXT_RE.test(runRest)) {
      report(
        "R2",
        index + 1,
        "run: 单行内直接插值不可信上下文 — 改经 step/job `env:` 传入 shell（防模板注入）",
      )
    }
  }

  // --- R3: 每个 job 显式 timeout-minutes ---

  const jobsIndex = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line))
  if (jobsIndex >= 0) {
    const jobRanges = []
    let currentJob = null
    for (let index = jobsIndex + 1; index < lines.length; index++) {
      const jobKey = lines[index].match(/^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/)
      if (jobKey) {
        if (currentJob) {
          currentJob.end = index - 1
          jobRanges.push(currentJob)
        }
        currentJob = { name: jobKey[1], start: index, end: lines.length - 1 }
      }
    }
    if (currentJob) jobRanges.push(currentJob)

    for (const job of jobRanges) {
      const block = lines.slice(job.start, job.end + 1)
      const hasTimeout = block.some((line) => /^\s*timeout-minutes:\s*\S/.test(line))
      if (!hasTimeout) {
        report(
          "R3",
          job.start + 1,
          `job \`${job.name}\` 缺少 timeout-minutes — 挂死的构建/测试会烧满默认 6 小时 runner 上限`,
        )
      }
    }
  }

  return violations
}

function checkWorkflows(directory = workflowsDir) {
  const violations = []
  const workflowFiles = readdirSync(directory)
    .filter((file) => /\.ya?ml$/i.test(file))
    .sort()

  for (const file of workflowFiles) {
    const content = readFileSync(path.join(directory, file), "utf8")
    violations.push(...findWorkflowHygieneViolations(file, content))
  }
  return violations
}

// 直接执行时作为 CLI 守卫运行（供 lint:fe / pre-commit 调用）。
// 判别依据：import.meta.url 与 process.argv[1] 指向同一脚本。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const violations = checkWorkflows()
  if (violations.length > 0) {
    console.error(`发现 ${violations.length} 处 workflow 卫生违规：`)
    for (const { rule, file, line, message } of violations) {
      console.error(`  [${rule}] .github/workflows/${file}:${line} — ${message}`)
    }
    process.exit(1)
  }
  console.log("Workflow hygiene checks passed.")
}

export { findWorkflowHygieneViolations, checkWorkflows }

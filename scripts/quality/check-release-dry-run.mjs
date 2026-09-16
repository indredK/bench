/**
 * Release dry-run 成功语义守卫（T30）。
 *
 * 背景：`ci-build.yml` 的 publish job 里，`Publish guard` 曾无条件执行，
 * 而 DRY_RUN=true 时 guard 直接 `exit 1` —— 两个 release target、资产校验、
 * latest.json、updater 签名全部通过之后，流水线仍被整体判红（run #589）。
 * dry-run 的目的就是用“成功”证明完整预检通过且无副作用；把“拒绝写入”
 * 实现成流水线失败会让成功信号失真，也会让 required context 语义漂移。
 *
 * 规则（任一命中即 exit 1，扫描 .github/workflows/ 全部 yml）：
 *   R1 guard-gated — 名为 `Publish guard` 的步骤必须带
 *                    `if: env.DRY_RUN == 'false'`（只在正式发布模式运行）。
 *   R2 write-gated — Release 写操作步骤（gh release create/upload 等）必须带
 *                    `if: env.DRY_RUN == 'false'`；不允许出现无条件的
 *                    Release 写步骤。
 *
 * 与 check-release-toolchain.mjs 同族：零依赖、文本级扫描。
 *
 * Exit code 1 if any violation is found, 0 otherwise.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const workflowsDir = path.join(rootDir, ".github", "workflows")

const GUARD_NAME_RE = /^\s*- name:\s*Publish guard\s*$/m
const STEP_START_RE = /^(\s*)-\s+(.*)$/
const PUBLISH_ONLY_IF_RE = /if:\s*env\.DRY_RUN\s*==\s*'false'/
const RELEASE_WRITE_RE = /gh release (create|upload|delete|edit)/

/** 把 workflow 拆成「step」区间（与 check-release-toolchain 同款算法）。 */
function findSteps(lines) {
  const steps = []
  for (let index = 0; index < lines.length; index++) {
    const stepMatch = lines[index].match(STEP_START_RE)
    if (!stepMatch) continue
    const indent = stepMatch[1].length

    let end = lines.length - 1
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const line = lines[cursor]
      if (line.trim() === "") continue
      const lineIndent = line.length - line.trimStart().length
      if (lineIndent <= indent) {
        end = cursor - 1
        break
      }
    }
    steps.push({ line: index + 1, text: lines.slice(index, end + 1).join("\n") })
  }
  return steps
}

function findDryRunViolations(file, content) {
  const lines = content.split("\n")
  const steps = findSteps(lines)
  const violations = []
  const report = (rule, line, message) => violations.push({ rule, file, line, message })

  for (const step of steps) {
    const gated = PUBLISH_ONLY_IF_RE.test(step.text)

    if (GUARD_NAME_RE.test(step.text) && !gated) {
      report(
        "R1",
        step.line,
        "`Publish guard` 步骤缺少 `if: env.DRY_RUN == 'false'` — " +
          "dry-run 会在预检全部通过后仍被 guard 判红（T30 / run #589 实际故障）",
      )
    }

    if (RELEASE_WRITE_RE.test(step.text) && !gated) {
      report(
        "R2",
        step.line,
        "Release 写操作步骤缺少 `if: env.DRY_RUN == 'false'` — " +
          "dry-run 不得产生 GitHub Release 副作用",
      )
    }
  }

  return violations
}

function checkReleaseDryRun(directory = workflowsDir) {
  const violations = []
  const workflowFiles = readdirSync(directory)
    .filter((file) => /\.ya?ml$/i.test(file))
    .sort()

  for (const file of workflowFiles) {
    const content = readFileSync(path.join(directory, file), "utf8")
    violations.push(...findDryRunViolations(file, content))
  }
  return violations
}

// 直接执行时作为 CLI 守卫运行（供 lint:fe / pre-commit 调用）。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const violations = checkReleaseDryRun()
  if (violations.length > 0) {
    console.error(`发现 ${violations.length} 处 release dry-run 语义违规：`)
    for (const { rule, file, line, message } of violations) {
      console.error(`  [${rule}] .github/workflows/${file}:${line} — ${message}`)
    }
    process.exit(1)
  }
  console.log("Release dry-run semantics checks passed.")
}

export { checkReleaseDryRun, findDryRunViolations }

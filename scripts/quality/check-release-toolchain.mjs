/**
 * Rust 工具链 / target 安装守卫（T24）。
 *
 * 背景：v1.35.0 正式发布失败——release-build job 给 dtolnay/rust-toolchain 传了
 * `targets:` 却没传 `toolchain:`。action 把 target 装到浮动的 `stable-<host>`
 * 上，而 cargo 因为 rust-toolchain.toml 实际使用 `1.98.1-<host>`：两个名字是不同
 * 的 rustup toolchain，于是构建以 `can't find crate for std` 失败，Publish job
 * 被跳过、Release 资产为 0。这个错误在 workflow 里完全静态可见，必须由守卫拦下，
 * 而不是等 90 分钟的 runner 跑完。
 *
 * 规则（任一命中即 exit 1）：
 *   R1 rust-toolchain-unpinned — `uses: dtolnay/rust-toolchain@<sha>` 的步骤必须
 *                                显式给出精确 `toolchain:`（缺省值跟随浮动 `stable`）。
 *   R2 rust-toolchain-drift    — `toolchain:` 必须等于 rust-toolchain.toml 的
 *                                `channel`：仓库只对这一个版本负责。
 *   R3 release-target-unverified — 安装了 `targets:` 的步骤之后，同一 job 必须存在
 *                                执行 `rustup target list --installed` 的断言步骤，
 *                                让缺 target 的故障在秒级可诊断。
 *
 * 与 check-workflow-hygiene.mjs 同族：零依赖、文本级扫描（workflow 不是运行时
 * 数据，不需要完整 YAML 解析；行级规则更易读也更容易写负向测试）。
 *
 * Exit code 1 if any violation is found, 0 otherwise.
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const workflowsDir = path.join(rootDir, ".github", "workflows")
const toolchainFile = path.join(rootDir, "rust-toolchain.toml")

const RUST_TOOLCHAIN_ACTION_RE = /uses:\s*dtolnay\/rust-toolchain@/
const TARGET_ASSERTION_RE = /rustup target list --installed/
const JOB_KEY_RE = /^ {2}([A-Za-z0-9_-]+):\s*(?:#.*)?$/
const STEP_START_RE = /^(\s*)-\s+(.*)$/

/** rust-toolchain.toml 里被验证过的唯一版本；读不到时返回 null。 */
function readPinnedRustChannel(file = toolchainFile) {
  let raw
  try {
    raw = readFileSync(file, "utf8")
  } catch {
    return null
  }
  const match = raw.match(/^\s*channel\s*=\s*"([^"]+)"/m)
  return match ? match[1] : null
}

/** 把 workflow 拆成「job + step」区间，用于判断断言步骤是否在同一 job 内。 */
function findSteps(lines) {
  const steps = []
  let job = "(unknown)"
  for (let index = 0; index < lines.length; index++) {
    const jobMatch = lines[index].match(JOB_KEY_RE)
    if (jobMatch) job = jobMatch[1]

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
    steps.push({ job, line: index + 1, text: lines.slice(index, end + 1).join("\n") })
  }
  return steps
}

/** 取步骤 `with:` 下的键值（`toolchain: 1.98.1` / `targets: ${{ matrix.target }}`）。 */
function stepWithValue(stepText, key) {
  const match = stepText.match(new RegExp(`^\\s+${key}:\\s*(\\S.*?)\\s*$`, "m"))
  return match ? match[1] : null
}

function findReleaseToolchainViolations(file, content, { pinnedChannel = null } = {}) {
  const lines = content.split("\n")
  const steps = findSteps(lines)
  const violations = []
  const report = (rule, line, message) => violations.push({ rule, file, line, message })

  for (const step of steps) {
    if (!RUST_TOOLCHAIN_ACTION_RE.test(step.text)) continue

    const pinnedToolchain = stepWithValue(step.text, "toolchain")
    const targets = stepWithValue(step.text, "targets")

    if (!pinnedToolchain) {
      report(
        "R1",
        step.line,
        `job \`${step.job}\` 的 dtolnay/rust-toolchain 未指定精确 toolchain — ` +
          "target 会装到浮动的 `stable-<host>` 上，而 cargo 走 rust-toolchain.toml，" +
          "构建将以 `can't find crate for std` 失败（v1.35.0 实际故障）",
      )
    } else if (pinnedChannel && pinnedToolchain !== pinnedChannel) {
      report(
        "R2",
        step.line,
        `job \`${step.job}\` 安装 toolchain ${pinnedToolchain}，但 rust-toolchain.toml 固定 ${pinnedChannel}` +
          " — 两者必须一致，否则 runner 上跑的不是被验证过的版本",
      )
    }

    if (targets) {
      const assertion = steps.some(
        (candidate) =>
          candidate.job === step.job &&
          candidate.line > step.line &&
          TARGET_ASSERTION_RE.test(candidate.text),
      )
      if (!assertion) {
        report(
          "R3",
          step.line,
          `job \`${step.job}\` 安装了 targets: ${targets} 但没有后续的 ` +
            "`rustup target list --installed` 断言 — 缺 target 时只会在编译期以晦涩错误暴露",
        )
      }
    }
  }

  return violations
}

function checkReleaseToolchain(directory = workflowsDir) {
  const pinnedChannel = readPinnedRustChannel()
  const violations = []
  const workflowFiles = readdirSync(directory)
    .filter((file) => /\.ya?ml$/i.test(file))
    .sort()

  for (const file of workflowFiles) {
    const content = readFileSync(path.join(directory, file), "utf8")
    violations.push(...findReleaseToolchainViolations(file, content, { pinnedChannel }))
  }
  return violations
}

// 直接执行时作为 CLI 守卫运行（供 lint:fe / pre-commit 调用）。
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  const violations = checkReleaseToolchain()
  if (violations.length > 0) {
    console.error(`发现 ${violations.length} 处 Rust 工具链/target 安装违规：`)
    for (const { rule, file, line, message } of violations) {
      console.error(`  [${rule}] .github/workflows/${file}:${line} — ${message}`)
    }
    process.exit(1)
  }
  const channel = readPinnedRustChannel()
  console.log(`Release toolchain checks passed (pinned rust ${channel ?? "unknown"}).`)
}

export { checkReleaseToolchain, findReleaseToolchainViolations, readPinnedRustChannel }

#!/usr/bin/env node
/**
 * safe-upgrade.mjs — 安全依赖升级脚本
 *
 * 设计目标：只做"范围内（in-range）"的安全升级，并守住 window-vibrancy 这类
 * "与 Tauri 内部版本冲突会导致 macOS 链接失败"的坑。
 *
 * 用法：
 *   node scripts/maintenance/safe-upgrade.mjs [fe|be|all] [--dry-run]
 *
 *   fe        仅升级前端（pnpm，范围内）
 *   be        仅升级后端（cargo，范围内 + 护栏校验）
 *   all       先 fe 后 be（默认）
 *   --dry-run 只打印计划，不修改任何 lockfile，不跑验证
 */
import { spawn } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const beDir = path.join(rootDir, "src-tauri")
const configPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "guarded-crates.json")
const TAURI_CRATE_NAME = "tauri"

// ---- 颜色（保持简单，不引入额外依赖） ----
const c = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
}
const ok = (s) => c.green + s + c.reset
const fail = (s) => c.red + s + c.reset
const warn = (s) => c.yellow + s + c.reset
const info = (s) => c.blue + s + c.reset
const dim = (s) => c.gray + s + c.reset

// ---- 动态转圈指示（长命令运行时让用户知道进度，区分"运行中 / 卡死 / 完成"） ----
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

function makeSpinner(text) {
  // 非交互终端（CI / 管道）：不做动画，直接打印一行，避免日志里出现控制字符
  if (!process.stderr.isTTY) {
    process.stderr.write(text + " …\n")
    return { stop() {}, final() {}, clear() {} }
  }
  let i = 0
  const start = Date.now()
  let slow = false
  const timer = setInterval(() => {
    i = (i + 1) % SPINNER_FRAMES.length
    const tail = slow ? dim("  (仍在进行，可能较慢…)") : ""
    process.stderr.write("\r\x1b[K" + info(SPINNER_FRAMES[i]) + " " + text + tail)
  }, 100)
  // 超过 30s 仍未结束，提示用户程序还在跑、不是卡死
  const slowTimer = setTimeout(() => {
    slow = true
  }, 30000)
  const finish = (symbol, newlineBefore) => {
    clearInterval(timer)
    clearTimeout(slowTimer)
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    const prefix = newlineBefore ? "\n" : "\r\x1b[K"
    process.stderr.write(prefix + symbol + " " + text + dim(` (${elapsed}s)`) + "\n")
  }
  return {
    // 命令无输出时：原地覆盖为单行结果
    stop(symbol) {
      finish(symbol, false)
    },
    // 命令有实时输出时：在输出之后另起一行给出结果
    final(symbol) {
      finish(symbol, true)
    },
    // 子进程开始吐出输出，先清掉转圈行，把屏幕交给真实输出
    clear() {
      clearInterval(timer)
      clearTimeout(slowTimer)
      process.stderr.write("\r\x1b[K")
    },
  }
}

// ---- 命令执行（异步 + 转圈） ----
async function runAsync(label, cmd, args, cwd = rootDir, opts = {}) {
  const captureStdout = opts.capture ?? false
  const echo = opts.echo ?? true
  const sp = makeSpinner(label)
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: false })
    let stdout = ""
    let stderr = ""
    let sawOutput = false
    let settled = false
    const flush = (chunk) => {
      if (!sawOutput) {
        sp.clear()
        sawOutput = true
      }
      process.stderr.write(chunk)
    }
    if (captureStdout)
      child.stdout.on("data", (d) => {
        stdout += d
        if (echo) flush(d)
      })
    else
      child.stdout.on("data", (d) => {
        if (echo) flush(d)
      })
    child.stderr.on("data", (d) => {
      stderr += d
      if (echo) flush(d)
    })
    const settle = (code) => {
      if (settled) return
      settled = true
      // quiet：批量/探测场景下只动画不打印结果行，避免刷屏
      if (opts.quiet) {
        sp.clear()
        resolve({ ok: code === 0, stdout, stderr, status: code })
        return
      }
      if (!sawOutput) sp.stop(code === 0 ? ok("✓ " + label) : fail("✗ " + label))
      else sp.final(code === 0 ? ok("✓ " + label) : fail("✗ " + label))
      resolve({ ok: code === 0, stdout, stderr, status: code })
    }
    child.on("error", (err) => {
      if (settled) return
      settled = true
      if (opts.quiet) {
        sp.clear()
        resolve({ ok: false, error: err.message, stdout, stderr, status: null })
        return
      }
      if (!sawOutput) sp.stop(fail("✗ " + label))
      else sp.final(fail("✗ " + label))
      resolve({ ok: false, error: err.message, stdout, stderr, status: null })
    })
    child.on("close", (code) => settle(code))
  })
}

// 兼容旧签名：run(label, cmd, args, cwd, failOnNonZero)
async function run(label, cmd, args, cwd = rootDir, failOnNonZero = true) {
  const r = await runAsync(label, cmd, args, cwd)
  if (failOnNonZero && !r.ok) {
    printCommandFailure(label, cmd, args, r)
    process.exit(r.status ?? 1)
  }
  return r.status ?? 0
}

// capture：返回 { ok, stdout, status }，不因子命令非 0 退出
// opts 透传给 runAsync（如 echo / quiet）
async function captureAsync(label, cmd, args, cwd = rootDir, opts = {}) {
  return runAsync(label, cmd, args, cwd, { capture: true, failOnNonZero: false, ...opts })
}

function printCommandFailure(label, cmd, args, result) {
  const detail = result.error || (result.stderr ?? "").trim()
  console.error(fail(`\n${label} 失败: ${cmd} ${args.join(" ")}`))
  if (detail) console.error(fail(detail))
}

function requireCommandSuccess(label, cmd, args, result) {
  if (result.ok) return
  printCommandFailure(label, cmd, args, result)
  process.exit(result.status ?? 1)
}

function parseJson(text, context) {
  const body = (text ?? "").trim()
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(fail(`${context} JSON 解析失败: ${message}`))
    process.exit(1)
  }
}

// ---- 包管理器探测（与 scripts/quality/pre-commit-check.mjs 一致） ----
function detectPackageManager() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"))
    const spec = pkg.packageManager ?? ""
    const match = /^(@[\w-]+\/)?(?<name>[\w-]+)@\d/.exec(spec)
    if (match?.groups?.name) {
      return process.platform === "win32" ? `${match.groups.name}.cmd` : match.groups.name
    }
  } catch {
    // ignore
  }
  return process.platform === "win32" ? "npm.cmd" : "npm"
}
const pkgManager = detectPackageManager()

// =====================================================================
// 前端
// =====================================================================
async function getOutdatedFe() {
  const args = ["outdated", "--format", "json"]
  const r = await captureAsync("检查前端过期依赖 (pnpm outdated)", pkgManager, args, rootDir, {
    echo: false,
  })
  const parsed = parseJson(r.stdout, "pnpm outdated")
  if (!r.ok && parsed === null) {
    requireCommandSuccess("检查前端过期依赖 (pnpm outdated)", pkgManager, args, r)
  }
  if (parsed === null) return []
  const arr = Array.isArray(parsed)
    ? parsed
    : Object.entries(parsed).map(([name, value]) => ({ name, ...value }))
  return arr.filter((dep) => dep && dep.name)
}

function splitFrontendUpdates(outdated) {
  const inRange = []
  const manual = []
  for (const dep of outdated) {
    const wanted = dep.wanted ?? dep.latest
    if (dep.current && wanted && wanted !== dep.current) {
      inRange.push({ ...dep, target: wanted })
    }
    if (dep.current && dep.latest && dep.latest !== dep.current && dep.latest !== wanted) {
      manual.push(dep)
    }
  }
  return { inRange, manual }
}

async function upgradeFrontend(dryRun) {
  console.log(`\n${c.bold}── 前端 (pnpm) ──${c.reset}`)
  const outdated = await getOutdatedFe()
  const { inRange, manual } = splitFrontendUpdates(outdated)
  if (inRange.length === 0 && manual.length === 0) {
    console.log(ok("前端依赖已是最新（范围内）。"))
    return true
  }
  if (inRange.length > 0) {
    console.log(`发现 ${inRange.length} 个范围内可自动更新依赖：`)
    for (const dep of inRange) {
      console.log(`  ${dep.name}: ${dep.current} → ${dep.target} (${dep.dependencyType ?? "dep"})`)
    }
  } else {
    console.log(ok("前端范围内依赖已是最新。"))
  }
  if (manual.length > 0) {
    console.log(warn("\n需人工评估的前端超范围升级（未自动应用，需改 package.json）："))
    for (const dep of manual) {
      console.log(
        warn(`  ${dep.name}: ${dep.current} → 最新 ${dep.latest} (${dep.dependencyType ?? "dep"})`),
      )
    }
  }
  if (dryRun) {
    console.log(dim("[dry-run] 未执行 pnpm update，未跑验证链。"))
    return true
  }
  if (inRange.length === 0) {
    console.log(dim("没有范围内更新，跳过 pnpm update 与验证链。"))
    return true
  }
  await run("更新前端依赖（仅范围内，不跨 major）", pkgManager, ["update"])
  await run("验证: lint:fe", pkgManager, ["run", "lint:fe"])
  await run("验证: test:critical", pkgManager, ["run", "test:critical"])
  return true
}

// =====================================================================
// 后端
// =====================================================================
function loadGuardedConfig() {
  if (!existsSync(configPath)) return {}
  return parseJson(readFileSync(configPath, "utf8"), "guarded-crates.json") ?? {}
}

async function getCargoMetadata(label = "读取后端依赖图 (cargo metadata)") {
  const args = ["metadata", "--format-version", "1", "--locked", "--quiet"]
  const r = await captureAsync(label, "cargo", args, beDir, { echo: false })
  requireCommandSuccess(label, "cargo", args, r)
  const meta = parseJson(r.stdout, "cargo metadata")
  if (!meta?.resolve?.root || !Array.isArray(meta.packages) || !Array.isArray(meta.resolve.nodes)) {
    console.error(
      fail("cargo metadata 输出缺少 packages/resolve.root/resolve.nodes，无法执行后端护栏。"),
    )
    process.exit(1)
  }
  return meta
}

function isNormalDependencyKind(depKind) {
  return depKind.kind !== "dev" && depKind.kind !== "build"
}

function buildCargoGraph(meta) {
  const packageById = new Map(meta.packages.map((pkg) => [pkg.id, pkg]))
  const nodeById = new Map(meta.resolve.nodes.map((node) => [node.id, node]))
  const rootId = meta.resolve.root
  const rootPackage = packageById.get(rootId)
  if (!rootPackage) {
    console.error(fail("cargo metadata 未包含 root package，无法执行后端护栏。"))
    process.exit(1)
  }

  const normalChildIds = (id) => {
    const node = nodeById.get(id)
    if (!node?.deps) return []
    return node.deps
      .filter((dep) => dep.dep_kinds?.some(isNormalDependencyKind))
      .map((dep) => dep.pkg)
  }

  const walk = (startIds) => {
    const seen = new Set()
    const stack = [...startIds]
    while (stack.length > 0) {
      const id = stack.pop()
      if (!id || seen.has(id)) continue
      seen.add(id)
      for (const childId of normalChildIds(id)) stack.push(childId)
    }
    return seen
  }

  const reachableNormalIds = walk([rootId])
  const tauriRootIds = normalChildIds(rootId).filter(
    (id) => packageById.get(id)?.name === TAURI_CRATE_NAME,
  )
  const tauriReachableIds = walk(tauriRootIds)
  const directDeps = rootPackage.dependencies
    .filter((dep) => isNormalDependencyKind(dep))
    .map((dep) => dep.name)

  return { directDeps, packageById, reachableNormalIds, tauriReachableIds }
}

function inspectCrateFromGraph(graph, crate) {
  const matchingIds = [...graph.reachableNormalIds].filter(
    (id) => graph.packageById.get(id)?.name === crate,
  )
  const versions = new Set(matchingIds.map((id) => graph.packageById.get(id).version))
  const tauriParent = [...graph.tauriReachableIds].some(
    (id) => graph.packageById.get(id)?.name === crate,
  )
  return { versions, tauriParent }
}

function formatVersions(versions) {
  return [...versions].sort().join(", ") || "未在依赖图中出现"
}

async function reportOutOfRange(directDeps) {
  const args = ["outdated", "--color", "never", "--depth", "1"]
  const r = await captureAsync("分析超范围升级 (cargo outdated)", "cargo", args, beDir, {
    echo: false,
  })
  if (!r.ok || !(r.stdout ?? "").trim()) {
    const detail = (r.stderr || r.error || "").trim()
    if (
      detail.includes("resolve host") ||
      detail.includes("download") ||
      detail.includes("network")
    ) {
      console.log(dim("\n(cargo-outdated 需要联网检查，当前网络不可用，跳过超范围升级提示。)"))
    } else {
      console.log(
        dim(
          "\n(cargo-outdated 未安装或不可用，跳过超范围升级提示；如需此提示请 `cargo install cargo-outdated`)",
        ),
      )
    }
    return
  }
  const directSet = new Set(directDeps)
  const rows = []
  for (const line of (r.stdout ?? "").split("\n")) {
    const m = line.match(/^(\S+)\s+(\S+)\s+(---|\S+)\s+(\S+)/)
    if (!m) continue
    const [, name, project, compat, latest] = m
    // compat 为 "---" 表示最新版超出当前 semver 约束（破坏性/major 升级）
    // 仅聚焦直接依赖；子依赖会随父依赖自动变动。忽略 latest=Removed（yanked/不可用）。
    if (compat === "---" && latest !== "Removed" && latest !== project && directSet.has(name)) {
      rows.push({ name, project, latest })
    }
  }
  if (rows.length) {
    console.log(warn("\n需人工评估的超范围升级（未自动应用，需改 Cargo.toml）："))
    for (const row of rows) {
      console.log(warn(`  ${row.name}: ${row.project} → 最新 ${row.latest} (破坏性/major)`))
    }
  } else {
    console.log(dim("\n无需要人工决策的直接依赖超范围升级。"))
  }
}

async function upgradeBackend(dryRun) {
  console.log(`\n${c.bold}── 后端 (cargo) ──${c.reset}`)

  const config = loadGuardedConfig()
  const guarded = new Map()
  for (const [name, info] of Object.entries(config)) {
    guarded.set(name, { ...info, auto: false })
  }

  const meta = await getCargoMetadata()
  const graph = buildCargoGraph(meta)

  // 自动探测只做观察，不做硬拦截；Rust 纯库多版本共存很常见。
  // 硬拦截仅针对 guarded-crates.json 里明确记录过原生链接/历史事故的 crate。
  const observedShared = []
  for (const dep of graph.directDeps) {
    if (dep === TAURI_CRATE_NAME) continue
    if (guarded.has(dep)) continue
    const crateInfo = inspectCrateFromGraph(graph, dep)
    if (crateInfo.tauriParent) {
      observedShared.push({ name: dep, versions: crateInfo.versions })
    }
  }

  console.log(`\n护栏检查：监控 ${guarded.size} 个显式受保护 crate`)
  let conflict = false
  for (const [name, info] of guarded) {
    const crateInfo = inspectCrateFromGraph(graph, name)
    if (crateInfo.versions.size === 0) {
      console.error(
        fail(`  ✗ ${name} 未出现在当前后端依赖图中，请检查 guarded-crates.json 是否过期。`),
      )
      conflict = true
    } else if (crateInfo.versions.size > 1) {
      conflict = true
      console.error(fail(`  ✗ ${name} 存在版本分裂: ${formatVersions(crateInfo.versions)}`))
      console.error(
        fail(
          `    ${info.reason || "与 Tauri 内部版本不一致可能导致链接冲突（bitcode symbol multiply defined）。"}`,
        ),
      )
    } else {
      console.log(
        ok(`  ✓ ${name} = ${formatVersions(crateInfo.versions)} 单版本 ${dim("(config)")}`),
      )
    }
  }
  if (observedShared.length > 0) {
    const split = observedShared.filter((item) => item.versions.size > 1)
    console.log(
      dim(`  · 自动观察 ${observedShared.length} 个与 Tauri 共享的直接依赖（仅提示，不拦截）`),
    )
    if (split.length > 0) {
      for (const item of split) {
        console.log(dim(`    ${item.name}: ${formatVersions(item.versions)} 多版本共存`))
      }
    }
  }

  if (conflict) {
    console.error(
      fail("\n护栏拦截：检测到与 Tauri 版本冲突的依赖，已中止。请勿跨 semver 升级这些 crate。"),
    )
    process.exit(1)
  }

  await reportOutOfRange(graph.directDeps)

  if (dryRun) {
    console.log(dim("\n[dry-run] 未执行 cargo update / cargo check。"))
    return true
  }

  await run("更新后端依赖（仅范围内）", "cargo", ["update"], beDir)

  // 更新后重验：理论上 cargo update 不会制造分裂，但防御性再查一次
  const postGraph = buildCargoGraph(await getCargoMetadata("更新后读取后端依赖图 (cargo metadata)"))
  let postConflict = false
  for (const [name, info] of guarded) {
    const crateInfo = inspectCrateFromGraph(postGraph, name)
    if (crateInfo.versions.size !== 1) {
      postConflict = true
      const reason = info.reason || "与 Tauri 内部版本不一致可能导致链接冲突。"
      console.error(fail(`  ✗ 更新后 ${name} 版本异常: ${formatVersions(crateInfo.versions)}`))
      console.error(fail(`    ${reason}`))
    }
  }
  if (postConflict) {
    console.error(fail("\ncargo update 意外制造了版本分裂，请检查 Cargo.toml 与 Cargo.lock。"))
    process.exit(1)
  }

  await run("验证: cargo check", "cargo", ["check"], beDir)
  return true
}

// =====================================================================
// 入口
// =====================================================================
function printHelp() {
  console.log(`
safe-upgrade — 安全依赖升级

用法:
  node scripts/maintenance/safe-upgrade.mjs [fe|be|all] [--dry-run]

参数:
  fe          仅升级前端 (pnpm, 范围内)
  be          仅升级后端 (cargo, 范围内 + 护栏校验)
  all         先 fe 后 be (默认)
  --dry-run   只打印计划，不修改 lockfile，不跑验证

说明:
  - 前端仅应用 package.json 范围内的更新，不会跨 major。
  - 后端仅应用 Cargo.toml 约束范围内的更新 (cargo update)。
  - 与 Tauri 共享的 crate (如 window-vibrancy) 会被护栏校验单版本，
    若检测到版本分裂则中止，避免 macOS 链接失败。
  - 超范围 (破坏性/major) 升级仅提示，需人工改 Cargo.toml 后单独评估。
`)
}

async function main() {
  const args = process.argv.slice(2)
  let mode = "all"
  let dryRun = false
  for (const a of args) {
    if (a === "--dry-run" || a === "-n") dryRun = true
    else if (a === "--help" || a === "-h") {
      printHelp()
      process.exit(0)
    } else if (["fe", "be", "all"].includes(a)) mode = a
    else {
      console.error(fail("未知参数: " + a))
      printHelp()
      process.exit(1)
    }
  }

  console.log(
    c.bold + "\n🔧 safe-upgrade " + c.reset + dim(`(mode=${mode}${dryRun ? ", dry-run" : ""})`),
  )

  if (mode === "fe" || mode === "all") await upgradeFrontend(dryRun)
  if (mode === "be" || mode === "all") await upgradeBackend(dryRun)

  console.log(ok("\n✅ 安全升级完成，未检测到版本冲突。"))
}

;(async () => {
  try {
    await main()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(fail(`\nsafe-upgrade 异常退出: ${message}`))
    process.exit(1)
  }
})()

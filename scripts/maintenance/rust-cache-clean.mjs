#!/usr/bin/env node
/**
 * rust-cache-clean.mjs — Rust 构建缓存体检与温和瘦身（零三方依赖）。
 *
 * 背景（见 docs/explanation/rust-build-cache-optimization-research.md）：
 * Cargo 从不主动回收陈旧产物，`target/` 会随时间单调膨胀：
 *   - debug/incremental/  每个改动 session 一个目录，历史 session 永不清理（本地实测 17 个 / 1.7G）
 *   - debug/deps/         依赖图每次变化产生新 hash 的 rlib/rmeta/可执行文件，旧副本保留
 *   - rust-analyzer/      IDE 的 check 产物，含被废弃的 target 变体，可安全整体重建
 *
 * 本脚本只做**保守删除**（保留每个产物组的最新副本），最坏后果是下次增量很慢或
 * 触发重编译，不会有数据损失（对比 `pnpm run clean:be` = cargo clean 全清）。
 *
 * 用法：
 *   node scripts/maintenance/rust-cache-clean.mjs --stats
 *   node scripts/maintenance/rust-cache-clean.mjs --sweep --older-than 7d
 *   node scripts/maintenance/rust-cache-clean.mjs --sweep --include rust-analyzer --yes
 *
 * 参数：
 *   --stats                  只体检不删除（默认行为）
 *   --sweep                  执行清理
 *   --dry-run                配合 --sweep：打印将删除的内容但不删除
 *   --yes                    --sweep 不经二次确认直接执行（交互式菜单预设）
 *   --older-than <Nd>      incremental/deps 陈旧产物的保留期限，默认 7d
 *   --include <csv>        限定处理范围：incremental,stale-deps,orphan-lib,rust-analyzer
 *                          （默认前三项；rust-analyzer 会整体删除 IDE 的 check 产物，
 *                          需先关闭 IDE，因此需手动指定）
 *   --target-dir <path>      覆盖默认 target 目录（默认 <repo>/../tauri-app-target，D-021）
 *
 * 注意：批量删除在部分沙箱环境中会被拦截，请在本地终端运行。
 */
import { execFileSync } from "node:child_process"
import { createInterface } from "node:readline"
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
// D-021：target-dir 已外迁至 <repo>/../tauri-app-target
const defaultTargetDir = resolve(repoRoot, "..", "tauri-app-target")

// —— 参数解析 ——
const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name, fallback) => {
  const idx = args.indexOf(name)
  return idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("--") ? args[idx + 1] : fallback
}

const sweep = flag("--sweep")
const dryRun = flag("--dry-run")
const yes = flag("--yes")
const statsOnly = !sweep && !dryRun
const olderThanRaw = value("--older-than", "7d")
const includeRaw = value("--include", "incremental,stale-deps,orphan-lib")
const targetDir = resolve(value("--target-dir", defaultTargetDir))

const include = new Set(
  includeRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
)

const olderThanMs = (() => {
  const match = /^(\d+)([dhms]?)$/.exec(olderThanRaw.trim())
  if (!match) throw new Error(`--older-than 需要形如 7d / 12h / 30m 的值，收到：${olderThanRaw}`)
  const scale = { d: 86400, h: 3600, m: 60, "": 1, s: 1 }[match[2]]
  return Number(match[1]) * scale * 1000
})()

// —— 工具 ——
/**
 * 磁盘占用，优先取终端 `du -sk` 的结果（与用户在终端看到的数字一致）。
 * 不能直接累加 stat.size / st.blocks * 512：APFS 上的克隆文件会被重复计
 * （本项目 target 里 deps/<Crate>-<hash> 与 debug/<bin> 常共享 inode），
 * 实测累加得 16.9G 而 `du -sh` 只有 6.8G，高估一倍以上。
 * Windows 无 du，退回累加 stat.blocks * 512。
 */
function duBytes(target) {
  if (process.platform !== "win32") {
    try {
      const out = execFileSync("du", ["-sk", target], { encoding: "utf8" })
      const kb = Number(out.split(/\s+/)[0])
      if (Number.isFinite(kb)) return kb * 1024
    } catch {
      /* fallthrough */
    }
  }
  return null
}

function allocBytes(stat) {
  return stat.blocks > 0 ? stat.blocks * 512 : stat.size
}

/** 统计目录：bytes 用 du 口径，同时遍历得到文件数（用于提示 Cargo 不回收的性质）。 */
function measure(target) {
  let files = 0
  let dirs = 0
  let fallback = 0
  const stack = [target]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      let st
      try {
        st = statSync(full, { throwIfNoEntry: false })
      } catch {
        continue
      }
      if (!st) continue
      if (st.isDirectory()) {
        dirs++
        stack.push(full)
      } else {
        files++
        fallback += allocBytes(st)
      }
    }
  }
  const measured = duBytes(target)
  return { bytes: measured ?? fallback, files, dirs }
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let size = bytes / 1024
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit++
  }
  return `${size.toFixed(size >= 100 ? 0 : 1)} ${units[unit]}`
}

function latestMtime(target) {
  let newest = 0
  const stack = [target]
  let seen = false
  while (stack.length) {
    const current = stack.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(current, entry.name)
      let st
      try {
        st = statSync(full, { throwIfNoEntry: false })
      } catch {
        continue
      }
      if (!st) continue
      seen = true
      if (st.mtimeMs > newest) newest = st.mtimeMs
      if (st.isDirectory()) stack.push(full)
    }
  }
  return seen ? newest : 0
}

// 陈旧产物识别：`bench-a1b2c3d4`、`libbench_lib-a1b2c3d4f5e.rmeta` —— 8 位以上 hex 后缀
const HASH_SUFFIX = /^(.*)-([0-9a-f]{8,})(?:\.(.*))?$/

/** 按「产物组」聚合 deps 内同名多 hash 副本，返回可删除的陈旧项。 */
function collectStaleDeps(depsDir, cutoffMs) {
  const groups = new Map()
  let entries
  try {
    entries = readdirSync(depsDir, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    if (entry.isDirectory()) continue // dSYM 等目录单独处理（体积通常已计入同名二进制组）
    const match = HASH_SUFFIX.exec(entry.name)
    if (!match) continue
    const [, stem, hash, ext] = match
    const key = `${stem}|${ext ?? ""}`
    const full = join(depsDir, entry.name)
    const stat = statSync(full)
    const bucket = groups.get(key) ?? []
    bucket.push({ path: full, bytes: duBytes(full) ?? allocBytes(stat), mtimeMs: stat.mtimeMs })
    groups.set(key, bucket)
  }

  const stale = []
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue
    bucket.sort((a, b) => b.mtimeMs - a.mtimeMs)
    const now = Date.now()
    // 保留最新副本；更早的只有在超过保留期限后才删（避免刚切换依赖图就丢可用产物）
    for (const item of bucket.slice(1)) {
      if (now - item.mtimeMs >= cutoffMs) stale.push(item)
    }
    // 注意：deps 里同名多 hash 副本不会被 Cargo 回收，是 deps/ 膨胀的主因之一
  }
  return stale
}

/**
 * 读 src-tauri/Cargo.toml 的 [lib] crate-type，用于识别「当前已不再生成」的 lib 产物。
 * 例如 crate-type 从 ["lib","cdylib","staticlib"] 收敛为 ["lib"] 后，旧的
 * libbench_lib.a（本地实测 456 MB）会永远留在 deps/ 里，Cargo 不回收。
 */
function readLibTarget(repoRoot) {
  const cargoToml = join(repoRoot, "src-tauri", "Cargo.toml")
  if (!existsSync(cargoToml)) return null
  const text = readFileSync(cargoToml, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#")) // 跳过注释行
    .join("\n")
  const libSection = /\[lib\][\s\S]*?(?=\n\[|$)/.exec(text)?.[0]
  if (!libSection) return null
  const name = /name\s*=\s*"([^"]+)"/.exec(libSection)?.[1]
  const raw = /crate-type\s*=\s*\[([^\]]*)\]/.exec(libSection)?.[1] ?? ""
  const crateTypes = [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1])
  if (!name || !crateTypes.length) return null
  return { name, crateTypes, mtimeMs: statSync(cargoToml).mtimeMs }
}

/** 当前 crate-type 对应的产物文件名集合。 */
function expectedLibArtifacts({ name, crateTypes }) {
  const expected = new Set()
  for (const crateType of crateTypes) {
    if (crateType === "lib" || crateType === "rlib") expected.add(`lib${name}.rlib`)
    if (crateType === "staticlib") {
      expected.add(`lib${name}.a`)
      expected.add(`${name}.lib`)
    }
    if (crateType === "cdylib" || crateType === "dylib") {
      expected.add(`lib${name}.dylib`)
      expected.add(`lib${name}.so`)
      expected.add(`${name}.dll`)
    }
  }
  return expected
}

/**
 * 孤儿 lib 产物：deps/ 里属于本项目 lib target、但不在当前 crate-type 产物清单里，
 * 且比 Cargo.toml 更旧（= 本次构建没有刷新它，说明已不再生成）。
 */
function collectOrphanLibArtifacts(depsDir, libTarget) {
  if (!libTarget) return []
  const expected = expectedLibArtifacts(libTarget)
  const candidates = new Set([
    `lib${libTarget.name}.a`,
    `lib${libTarget.name}.dylib`,
    `lib${libTarget.name}.so`,
    `${libTarget.name}.lib`,
    `${libTarget.name}.dll`,
  ])
  const stale = []
  let entries
  try {
    entries = readdirSync(depsDir, { withFileTypes: true })
  } catch {
    return []
  }
  for (const entry of entries) {
    if (!candidates.has(entry.name) || expected.has(entry.name)) continue
    const full = join(depsDir, entry.name)
    const stat = statSync(full)
    if (stat.mtimeMs >= libTarget.mtimeMs) continue // 比 Cargo.toml 还新 = 仍在生产
    stale.push({ path: full, bytes: duBytes(full) ?? allocBytes(stat), mtimeMs: stat.mtimeMs })
  }
  return stale
}

/** incremental 会话：保留最新一个，其余按保留期限删除。 */
function collectIncrementalSessions(incDir, cutoffMs) {
  let entries
  try {
    entries = readdirSync(incDir, { withFileTypes: true })
  } catch {
    return { keep: [], stale: [] }
  }
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => {
      const full = join(incDir, e.name)
      const mtimeMs = latestMtime(full)
      return { path: full, name: e.name, mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)

  const now = Date.now()
  const keep = dirs.slice(0, 1)
  const stale = dirs.slice(1).filter((d) => now - d.mtimeMs >= cutoffMs)
  return { keep, stale }
}

function removeAll(items, dry, label) {
  let freed = 0
  let removed = 0
  for (const item of items) {
    if (dry) {
      console.log(`   [预览] ${label} ${basename(item.path)} — ${human(item.bytes ?? 0)}`)
    }
    freed += item.bytes ?? 0
    removed++
    if (!dry) {
      try {
        rmSync(item.path, { recursive: true, force: true })
      } catch (err) {
        console.log(`   [跳过] ${basename(item.path)}: ${err.message}`)
        freed -= item.bytes ?? 0
        removed--
      }
    }
  }
  return { freed, removed }
}

// —— 主流程 ——
function main() {
  if (!existsSync(targetDir)) {
    console.log(`[rust-cache] target 目录不存在：${targetDir}`)
    return
  }

  console.log("==============================")
  console.log("  Rust 构建缓存体检")
  console.log("==============================")
  console.log(`target 目录: ${targetDir}`)
  console.log(`保留期限: ${olderThanRaw}（更早的产物才会被删除）\n`)

  // 1) 顶层画像
  console.log("— 顶层占用 —")
  let totalBytes = 0
  const topEntries = readdirSync(targetDir, { withFileTypes: true })
  const topRows = []
  for (const entry of topEntries) {
    const full = join(targetDir, entry.name)
    const info = entry.isDirectory()
      ? measure(full)
      : { bytes: allocBytes(statSync(full)), files: 1, dirs: 0 }
    topRows.push({ name: entry.name, ...info })
    totalBytes += info.bytes
  }
  topRows.sort((a, b) => b.bytes - a.bytes)
  for (const row of topRows) {
    const files = row.files ? `${row.files} 文件` : `${row.dirs} 目录`
    console.log(`  ${row.name.padEnd(16)} ${human(row.bytes).padStart(9)}   (${files})`)
  }
  console.log(`  ${"合计".padEnd(15)} ${human(totalBytes).padStart(9)}\n`)

  // 2) 可清理项
  const plans = []
  const incrementalDir = join(targetDir, "debug", "incremental")
  if (include.has("incremental") && existsSync(incrementalDir)) {
    const { stale } = collectIncrementalSessions(incrementalDir, olderThanMs)
    for (const item of stale) item.bytes = measure(item.path).bytes
    if (stale.length) plans.push({ label: "incremental 历史会话", items: stale })
  }

  const depsDir = join(targetDir, "debug", "deps")
  if (include.has("stale-deps") && existsSync(depsDir)) {
    const stale = collectStaleDeps(depsDir, olderThanMs)
    if (stale.length) plans.push({ label: "deps 陈旧 hash 副本", items: stale })
  }

  // crate-type 收敛后遗留的 staticlib/cdylib（Cargo 不会回收，且已不再生成）
  if (include.has("orphan-lib") && existsSync(depsDir)) {
    const libTarget = readLibTarget(repoRoot)
    const stale = libTarget ? collectOrphanLibArtifacts(depsDir, libTarget) : []
    if (stale.length) plans.push({ label: "当前 crate-type 已不生成的 lib 产物", items: stale })
  }

  if (include.has("rust-analyzer")) {
    const raDir = join(targetDir, "rust-analyzer")
    if (existsSync(raDir)) {
      // IDE 的 check 产物可整体重建（下次打开工程时重新跑 check，约 1-3 分钟），
      // 因此不受 --older-than 限制。**建议先关闭 VS Code 再删**，否则正在写的
      // 会话会被清掉，IDE 需要重新分析。
      plans.push({
        label: "rust-analyzer check 产物（先关闭 IDE；下次打开自动重建）",
        items: [{ path: raDir, bytes: measure(raDir).bytes, mtimeMs: latestMtime(raDir) }],
      })
    }
  }

  console.log("— 可清理项 —")
  if (!plans.length) {
    console.log("  无（当前没有超过保留期限的陈旧产物）")
  } else {
    let reclaimable = 0
    for (const plan of plans) {
      const bytes = plan.items.reduce((sum, i) => sum + (i.bytes ?? 0), 0)
      reclaimable += bytes
      console.log(
        `  ${plan.label.padEnd(24)} ${String(plan.items.length).padStart(4)} 项   ${human(bytes).padStart(9)}`,
      )
    }
    console.log(`  ${"可回收合计".padEnd(21)} ${human(reclaimable).padStart(9)}`)
  }

  if (statsOnly || (!sweep && !dryRun)) {
    console.log("\n仅体检。执行清理：")
    console.log(
      `  node scripts/maintenance/rust-cache-clean.mjs --sweep --older-than ${olderThanRaw} --yes`,
    )
    console.log("全清（等价于 cargo clean，会触发一次全量重编译）：pnpm run clean:be")
    return
  }

  // 3) 删除
  if (!dryRun && !yes) {
    console.log("\n未带 --yes，进入二次确认。")
  }

  const runDelete = () => {
    let freed = 0
    let removed = 0
    for (const plan of plans) {
      const res = removeAll(plan.items, dryRun, plan.label)
      freed += res.freed
      removed += res.removed
    }
    console.log("\n==============================")
    console.log(`  ${dryRun ? "预览" : "清理"}完成: ${removed} 项, ${human(freed)}`)
    console.log("==============================")
    if (!dryRun && removed) {
      console.log("  下次构建会自动补齐所需产物（最多触发一次增量重编译）。")
    }
  }

  if (dryRun || yes) {
    runDelete()
    return
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  rl.question("确认删除以上陈旧产物？输入 y 继续：", (answer) => {
    rl.close()
    if (answer.trim().toLowerCase() !== "y") {
      console.log("已取消。")
      return
    }
    runDelete()
  })
}

main()

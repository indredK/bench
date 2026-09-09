#!/usr/bin/env node
/**
 * build-bench-host.mjs — 构建 bench-host sidecar 并按 Tauri 命名约定落位。
 *
 * Tauri v2 externalBin 要求二进制带 target-triple 后缀：
 *   src-tauri/binaries/bench-host-<target-triple>[.exe]
 * 运行时 Tauri 自动剥离后缀，`current_exe()` 同目录即为 bench-host。
 *
 * 交叉编译注意（Tauri 官方文档明确警告）：externalBin 要求**每个构建目标**
 * 都有对应 triple 的二进制——按 host triple 命名在交叉编译时无效。
 * 因此 `--target <triple>` 可为非 host 架构构建（bench-host 及其依赖均为
 * 纯 Rust，无 C 依赖，交叉编译可行）：
 *   node scripts/plugins/build-bench-host.mjs [--target x86_64-apple-darwin] [--force]
 * 无 --target 时构建 host 目标（tauri dev / beforeBuildCommand 默认路径）。
 *
 * 零三方依赖（Node built-ins only，对齐项目约定）。带 up-to-date 检查：
 * 产物比 bench-host 全部源文件新时跳过 cargo build。
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, copyFileSync, statSync, readdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { platform, arch } from "node:os"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const srcTauri = join(repoRoot, "src-tauri")
const binariesDir = join(srcTauri, "binaries")
const hostSrcDir = join(srcTauri, "crates/bench-host/src")
const capSrcDir = join(srcTauri, "crates/bench-capabilities/src")

function newestMtime(dir) {
  let newest = 0
  for (const name of readdirSync(dir)) {
    const m = statSync(join(dir, name)).mtimeMs
    if (m > newest) newest = m
  }
  return newest
}

/** host triple（tauri.conf 侧与 `rustc --print host-tuple` 约定一致）。 */
function hostTriple() {
  const triples = {
    "darwin-arm64": "aarch64-apple-darwin",
    "darwin-x64": "x86_64-apple-darwin",
    "win32-x64": "x86_64-pc-windows-msvc",
    "linux-x64": "x86_64-unknown-linux-gnu",
  }
  const triple = triples[`${platform()}-${arch()}`]
  if (!triple) throw new Error(`不支持的平台: ${platform()}-${arch()}`)
  return triple
}

/** cargo 定位：CARGO env → ~/.cargo/bin → PATH（部分环境不继承 rustup PATH）。 */
function resolveCargo() {
  if (process.env.CARGO && existsSync(process.env.CARGO)) return process.env.CARGO
  const home = process.env.HOME ?? ""
  const fallback = join(home, ".cargo/bin/cargo")
  if (existsSync(fallback)) return fallback
  return "cargo"
}

// —— 参数解析 ——
const force = process.argv.includes("--force")
const targetIdx = process.argv.indexOf("--target")
const target = targetIdx !== -1 ? process.argv[targetIdx + 1] : null
if (targetIdx !== -1 && (!target || /[/\\]/.test(target))) {
  throw new Error("--target 需要一个合法的 target triple（如 x86_64-apple-darwin）")
}

const triple = target ?? hostTriple()
// .exe 后缀看**目标**平台而非运行平台（交叉编译 Windows target 时必须带）。
const ext = triple.includes("windows") ? ".exe" : ""
const dest = join(binariesDir, `bench-host-${triple}${ext}`)

// —— up-to-date 检查 ——
const sourcesNewest = Math.max(newestMtime(hostSrcDir), newestMtime(capSrcDir))
const destExists = existsSync(dest)

if (destExists && !force) {
  const cargoTomlMtime = statSync(join(srcTauri, "crates/bench-host/Cargo.toml")).mtimeMs
  if (statSync(dest).mtimeMs >= Math.max(sourcesNewest, cargoTomlMtime)) {
    console.log(`[bench-host] up-to-date: ${dest}`)
    process.exit(0)
  }
}

// —— cargo build --release ——
mkdirSync(binariesDir, { recursive: true })
console.log(
  `[bench-host] cargo build --release -p bench-host${target ? ` --target ${target}` : ""}`,
)
const buildArgs = ["build", "--release", "-p", "bench-host"]
if (target) buildArgs.push("--target", target)
execFileSync(resolveCargo(), buildArgs, {
  cwd: srcTauri,
  stdio: "inherit",
})

// 产物定位：target-dir 可能被 .cargo/config.toml 重定向（D-021），从 cargo
// metadata 权威解析；交叉编译产物在 <target-dir>/<triple>/release/ 下。
const meta = JSON.parse(
  execFileSync(resolveCargo(), ["metadata", "--format-version", "1", "--no-deps"], {
    cwd: srcTauri,
    encoding: "utf8",
  }),
)
const built = join(
  meta.target_directory,
  ...(target ? [target] : []),
  "release",
  `bench-host${ext}`,
)
if (!existsSync(built)) throw new Error(`构建产物不存在: ${built}`)
copyFileSync(built, dest)
console.log(`[bench-host] sidecar ready: ${dest}`)

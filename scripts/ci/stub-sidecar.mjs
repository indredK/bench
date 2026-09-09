#!/usr/bin/env node
/**
 * stub-sidecar.mjs — 为 CI 的 cargo clippy / cargo test / cargo run 生成
 * bench-host sidecar 占位文件（stub）。
 *
 * 背景：tauri.conf.json 的 bundle.externalBin 声明了 `binaries/bench-host`，
 * tauri-build 的 build.rs 在编译期校验 `src-tauri/binaries/bench-host-<triple>`
 * 是否存在 —— 这意味着不只是 `tauri build`，连 cargo clippy / cargo test /
 * cargo run（如 publish job 的 verify_updater_manifest）都会触发校验。
 * 而 sidecar 产物不进 git（.gitignore: src-tauri/binaries/），CI checkout
 * 后该目录为空，clippy 直接失败（exit 101，双平台同因）。
 *
 * 用法：
 *   node scripts/ci/stub-sidecar.mjs           # 生成占位文件（幂等）
 *   node scripts/ci/stub-sidecar.mjs --clean   # 删除占位/产物文件
 *
 * --clean 的必要性：build-bench-host.mjs 的 up-to-date 检查只比较 mtime，
 * 占位文件比 bench-host 源码新时会误判"已是最新"而跳过真实 release 构建。
 * 因此真实构建（tauri build 冒烟的 beforeBuildCommand）之前必须先清理。
 *
 * 零三方依赖（Node built-ins only，对齐项目约定）。
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, rmSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { platform, arch } from "node:os"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const binariesDir = join(repoRoot, "src-tauri", "binaries")

const clean = process.argv.includes("--clean")

// 与 build-bench-host.mjs / tauri-build 使用的 host triple 约定一致。
const triples = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "linux-x64": "x86_64-unknown-linux-gnu",
}
const triple = triples[`${platform()}-${arch()}`]
if (!triple) throw new Error(`不支持的平台: ${platform()}-${arch()}`)

const ext = platform() === "win32" ? ".exe" : ""
const stub = join(binariesDir, `bench-host-${triple}${ext}`)

if (clean) {
  if (!existsSync(binariesDir)) process.exit(0)
  // 清理该 triple 的占位文件；也兜底清理其他 triple 残留（换机/交叉场景）。
  for (const name of readdirSync(binariesDir)) {
    if (name.startsWith("bench-host-")) {
      rmSync(join(binariesDir, name))
      console.log(`[stub-sidecar] removed: ${name}`)
    }
  }
  process.exit(0)
}

mkdirSync(binariesDir, { recursive: true })
// 占位文件内容为空：build.rs 只做存在性校验，不执行 sidecar。
if (!existsSync(stub)) {
  closeSync(openSync(stub, "w"))
  console.log(`[stub-sidecar] created: ${stub}`)
} else {
  console.log(`[stub-sidecar] exists: ${stub}`)
}

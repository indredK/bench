#!/usr/bin/env node
/**
 * P5：构建官方插件的 vite 产物（每个插件一个 vite.config.ts）。
 *
 * - 取代早期硬编码 photo-triage 单插件构建（`extensions:build`）；
 * - 产物 outDir = `extensions/<id>/assets/`（`base: "./"` 铁律在各自配置内）；
 * - 单个插件构建失败即整批失败（fail-fast，避免产物缺失被 stage/sync 静默吞掉）。
 *
 * 插件源目录解析（真源反转后默认可用，见 lib/market-dir.mjs）：
 * `--market <dir>` > `BENCH_MARKET_DIR` > 兄弟市场仓 > 旧 `cwd/extensions`。
 * 都不存在时保持空容错（beforeBuildCommand 链依赖本脚本 exit 0）。
 *
 * 用法：node scripts/plugins/build-extensions.mjs [--id <extension-id>] [--market <dir>]
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join, relative } from "node:path"
import { resolveBinPath, runCommand } from "../lib/platform.mjs"
import { skipDotfiles } from "./lib/extension-files.mjs"
import { resolveMarketDir } from "./lib/market-dir.mjs"

// Windows 上解析为 vite.cmd（sh 脚本形态无法直接启动），POSIX/CI 保持 vite。
const VITE_BIN = resolveBinPath(join(process.cwd(), "node_modules", ".bin"), "vite")
/** 树外插件源（市场仓）的临时构建区：放进宿主树下才能解析宿主 node_modules。 */
const TEMP_BUILD_ROOT = join(process.cwd(), ".extensions-build")

function main() {
  const market = resolveMarketDir()
  if (market.missing) {
    console.error(
      `[extensions:build] market dir does not exist (${market.source}): ${market.dir ?? "(unspecified)"}`,
    )
    process.exit(1)
  }
  const REPO_EXTENSIONS = market.dir
  if (!REPO_EXTENSIONS) {
    // 空容错：beforeBuildCommand 链上无插件源也必须让 tauri build 走完。
    console.log(
      "[extensions:build] no plugin sources found (hint: pass --market <dir> or set BENCH_MARKET_DIR); nothing to build",
    )
    return
  }
  if (!existsSync(VITE_BIN)) {
    console.error("[extensions:build] vite not found — run `pnpm install` first")
    process.exit(1)
  }
  // 与 CI release 流程一致：树外源码先拷入宿主树下（up-tree 解析宿主
  // node_modules），产物 assets/ 构建完成后回拷真实源目录。
  const outOfTree = relative(process.cwd(), REPO_EXTENSIONS).startsWith("..")

  const onlyId = process.argv.includes("--id")
    ? process.argv[process.argv.indexOf("--id") + 1]
    : null

  const ids = readdirSync(REPO_EXTENSIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => existsSync(join(REPO_EXTENSIONS, id, "vite.config.ts")))
    .sort()

  const targets = onlyId ? ids.filter((id) => id === onlyId) : ids
  if (targets.length === 0) {
    console.error(
      `[extensions:build] no matching plugin with vite.config.ts (found: ${ids.join(", ") || "none"})`,
    )
    process.exit(1)
  }

  let failed = 0
  for (const id of targets) {
    let sourceRoot = join(REPO_EXTENSIONS, id)
    let config = join(sourceRoot, "vite.config.ts")
    if (outOfTree) {
      // 树外源：拷入宿主树临时区构建（与 CI release 的 place-into-host 一致）。
      const tempId = join(TEMP_BUILD_ROOT, id)
      rmSync(tempId, { recursive: true, force: true })
      mkdirSync(TEMP_BUILD_ROOT, { recursive: true })
      cpSync(sourceRoot, tempId, { recursive: true, filter: skipDotfiles })
      sourceRoot = tempId
      config = join(tempId, "vite.config.ts")
    }
    console.log(`[extensions:build] building ${id} …`)
    const result = runCommand(VITE_BIN, ["build", "--config", config], {
      stdio: "inherit",
    })
    if (result.status !== 0) {
      console.error(`[extensions:build] ${id} FAILED (exit ${result.status})`)
      failed += 1
      if (outOfTree) rmSync(join(TEMP_BUILD_ROOT, id), { recursive: true, force: true })
      break // fail-fast：产物缺失比半成品更危险
    }
    if (outOfTree) {
      // 产物回拷真实源目录（sync/stage 从源目录取 assets/）。
      const builtAssets = join(sourceRoot, "assets")
      const targetAssets = join(REPO_EXTENSIONS, id, "assets")
      rmSync(targetAssets, { recursive: true, force: true })
      cpSync(builtAssets, targetAssets, { recursive: true, filter: skipDotfiles })
      rmSync(join(TEMP_BUILD_ROOT, id), { recursive: true, force: true })
    }
  }
  if (outOfTree) rmSync(TEMP_BUILD_ROOT, { recursive: true, force: true })

  if (failed > 0) process.exit(1)
  console.log(`[extensions:build] done (${targets.length} plugin(s))`)
}

main()

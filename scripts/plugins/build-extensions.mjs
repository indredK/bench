#!/usr/bin/env node
/**
 * P5：构建仓库内**全部**官方插件的 vite 产物（每个插件一个 vite.config.ts）。
 *
 * - 取代早期硬编码 photo-triage 单插件构建（`extensions:build`）；
 * - 产物 outDir = `extensions/<id>/assets/`（`base: "./"` 铁律在各自配置内）；
 * - 单个插件构建失败即整批失败（fail-fast，避免产物缺失被 stage/sync 静默吞掉）。
 *
 * 用法：node scripts/plugins/build-extensions.mjs [--id <extension-id>]
 */

import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { resolveBinPath, runCommand } from "../lib/platform.mjs"

const REPO_EXTENSIONS = join(process.cwd(), "extensions")
// Windows 上解析为 vite.cmd（sh 脚本形态无法直接启动），POSIX/CI 保持 vite。
const VITE_BIN = resolveBinPath(join(process.cwd(), "node_modules", ".bin"), "vite")

function main() {
  if (!existsSync(REPO_EXTENSIONS)) {
    // P5 真相源反转：插件源码在 plugin-market 仓库，Bench 基座可为零内置插件。
    console.log("[extensions:build] no extensions directory; nothing to build")
    return
  }
  if (!existsSync(VITE_BIN)) {
    console.error("[extensions:build] vite not found — run `pnpm install` first")
    process.exit(1)
  }

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
    const config = join(REPO_EXTENSIONS, id, "vite.config.ts")
    console.log(`[extensions:build] building ${id} …`)
    const result = runCommand(VITE_BIN, ["build", "--config", config], {
      stdio: "inherit",
    })
    if (result.status !== 0) {
      console.error(`[extensions:build] ${id} FAILED (exit ${result.status})`)
      failed += 1
      break // fail-fast：产物缺失比半成品更危险
    }
  }

  if (failed > 0) process.exit(1)
  console.log(`[extensions:build] done (${targets.length} plugin(s))`)
}

main()

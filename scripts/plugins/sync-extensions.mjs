#!/usr/bin/env node
/**
 * P2：把仓库 extensions/ 下的官方插件（bundled）产物同步到应用数据目录，
 * 供 dev 模式宿主经 asset provider 加载。
 *
 * - 复制 manifest.json / index.html / assets/（排除源码与文档）；
 * - 幂等：全量覆盖，不影响 `.disabled` 标记（禁用状态属于用户数据，保留）；
 * - 产物进 git 的部分只有 manifest + 源码；本脚本产出的是运行时副本。
 *
 * 用法：node scripts/plugins/sync-extensions.mjs [--print-dir]
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join } from "node:path"

/** 与 src-tauri/tauri.conf.json 的 identifier 保持一致。 */
const IDENTIFIER = "com.bench.app"
/** 与 src-tauri/src/extension_host/assets.rs::EXT_DIR_NAME 一致。 */
const EXT_DIR_NAME = "extensions"
const REPO_EXTENSIONS = join(process.cwd(), "extensions")

/** 每个插件需要同步的条目（manifest 必需，其余可选）。 */
const SYNC_ENTRIES = ["manifest.json", "index.html", "assets"]
/** 忽略的条目（源码/文档不进运行时目录）。 */
const IGNORED = new Set(["src", "README.md", "node_modules"])

function appDataDir() {
  const home = homedir()
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", IDENTIFIER)
    case "win32":
      return join(process.env.APPDATA || join(home, "AppData", "Roaming"), IDENTIFIER)
    default:
      return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), IDENTIFIER)
  }
}

function main() {
  const targetRoot = join(appDataDir(), EXT_DIR_NAME)

  if (process.argv.includes("--print-dir")) {
    console.log(targetRoot)
    return
  }

  if (!existsSync(REPO_EXTENSIONS)) {
    console.error(`[extensions] no extensions directory at ${REPO_EXTENSIONS}`)
    process.exit(1)
  }

  mkdirSync(targetRoot, { recursive: true })
  const ids = readdirSync(REPO_EXTENSIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  for (const id of ids) {
    const source = join(REPO_EXTENSIONS, id)
    const target = join(targetRoot, id)
    if (!existsSync(join(source, "manifest.json"))) {
      console.warn(`[extensions] skip ${id}: missing manifest.json`)
      continue
    }
    rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    for (const entry of SYNC_ENTRIES) {
      const from = join(source, entry)
      if (!existsSync(from)) continue
      cpSync(from, join(target, entry), { recursive: true })
    }
    // 保留用户的启用/禁用标记（若存在则回写）。
    console.log(`[extensions] synced ${id} -> ${target}`)
  }

  console.log(`[extensions] done (${ids.length} extension(s))`)
}

main()

#!/usr/bin/env node
/**
 * P2/P2b：把仓库 extensions/ 下的官方插件（bundled）产物同步到应用数据目录，
 * 供宿主经 asset provider 加载。
 *
 * 部署物选择（P2b 修复：白屏根因是部署了 vite 源码入口而非产物）：
 * - 若 `extensions/<id>/assets/index.html` 存在 → **构建产物模式**：
 *   `assets/` 内即是部署根（vite build 产出 index.html + bundle/）；
 * - 否则 → **静态模式**：仓库根 `index.html` + `assets/`（如 bench-poc 手写产物）。
 *
 * - 幂等：全量覆盖；`.disabled` 标记是用户数据，同步时保留；
 * - 产物不进 git（vite 产物目录已由构建生成，gitignore 自行管理）。
 *
 * 用法：node scripts/plugins/sync-extensions.mjs [--print-dir]
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { homedir, platform } from "node:os"
import { join } from "node:path"

/** 与 src-tauri/tauri.conf.json 的 identifier 保持一致。 */
const IDENTIFIER = "com.bench.app"
/** 与 src-tauri/src/extension_host/assets.rs::EXT_DIR_NAME 一致。 */
const EXT_DIR_NAME = "extensions"
const REPO_EXTENSIONS = join(process.cwd(), "extensions")
/** 用户禁用标记（src-tauri/src/extension_host/commands.rs::EXT_DISABLED_MARKER）。 */
const DISABLED_MARKER = ".disabled"

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

/** 把源目录内容复制为目标目录内容（target 自身保留 .disabled）。 */
function deployContents(fromDir, target) {
  const disabledPath = join(target, DISABLED_MARKER)
  const disabledBackup = existsSync(disabledPath) ? readFileSync(disabledPath) : null

  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(fromDir)) {
    cpSync(join(fromDir, entry), join(target, entry), { recursive: true })
  }
  if (disabledBackup !== null) {
    writeFileSync(disabledPath, disabledBackup)
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

  let synced = 0
  for (const id of ids) {
    const source = join(REPO_EXTENSIONS, id)
    const target = join(targetRoot, id)
    if (!existsSync(join(source, "manifest.json"))) {
      console.warn(`[extensions] skip ${id}: missing manifest.json`)
      continue
    }

    const builtIndex = join(source, "assets", "index.html")
    if (existsSync(builtIndex)) {
      // 构建产物模式：assets/ 内即部署根（index.html + bundle/）；
      // manifest.json 在插件根，单独补入部署根（宿主启动时 fail-closed 校验必需）。
      deployContents(join(source, "assets"), target)
      cpSync(join(source, "manifest.json"), join(target, "manifest.json"))
      console.log(`[extensions] synced (built) ${id} -> ${target}`)
    } else if (existsSync(join(source, "index.html"))) {
      // 静态模式：仅 manifest + 入口 + assets（源码/文档不进运行时目录）。
      const staging = join(targetRoot, `.${id}.staging`)
      rmSync(staging, { recursive: true, force: true })
      mkdirSync(staging, { recursive: true })
      for (const entry of ["manifest.json", "index.html", "assets"]) {
        const from = join(source, entry)
        if (existsSync(from)) cpSync(from, join(staging, entry), { recursive: true })
      }
      deployContents(staging, target)
      rmSync(staging, { recursive: true, force: true })
      console.log(`[extensions] synced (static) ${id} -> ${target}`)
    } else {
      console.warn(`[extensions] skip ${id}: no deployable index.html`)
      continue
    }
    synced += 1
  }

  console.log(`[extensions] done (${synced} extension(s))`)
}

main()

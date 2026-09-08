#!/usr/bin/env node
/**
 * P2/P2b：把仓库 extensions/ 下的官方插件（bundled）产物同步到应用数据目录，
 * 供宿主经 asset provider 加载。
 *
 * P3.1 起（manifest schema v2）：部署完成后扫描部署根，**逐文件计算
 * sha256 + size 并注入部署 manifest 的 `files` 清单**——宿主 `ext_open`
 * 前会全量校验（spec §3.3 / §3.4）；源 manifest 保持无 `files`（模板态），
 * 清单只存在于部署产物中。`manifest.json` 自身与宿主维护的 `.disabled`
 * 不入清单（前者文件哈希无法自嵌套）。
 *
 * 部署物选择（P2b 修复：白屏根因是部署了 vite 源码入口而非产物）：
 * - 若 `extensions/<id>/assets/index.html` 存在 → **构建产物模式**：
 *   `assets/` 内即是部署根（vite build 产出 index.html + bundle/）；
 * - 否则 → **静态模式**：仓库根 `index.html` + `assets/`（如 bench-poc 手写产物）。
 *
 * - 幂等：全量覆盖；`.disabled` 标记是用户数据，同步时保留；
 * - 点文件（`.DS_Store` 等）一律不部署——它们会造成宿主「清单外文件」拒绝；
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
import { createHash } from "node:crypto"
import { homedir, platform } from "node:os"
import { join, relative, sep } from "node:path"

/** 与 src-tauri/tauri.conf.json 的 identifier 保持一致。 */
const IDENTIFIER = "com.bench.app"
/** 与 src-tauri/src/extension_host/assets.rs::EXT_DIR_NAME 一致。 */
const EXT_DIR_NAME = "extensions"
const REPO_EXTENSIONS = join(process.cwd(), "extensions")
/** 用户禁用标记（src-tauri/src/extension_host/manifest.rs::EXT_DISABLED_MARKER）。 */
const DISABLED_MARKER = ".disabled"
/** 宿主不入清单的固定项（spec §3.3）。 */
const HASH_EXCLUDED = new Set(["manifest.json", DISABLED_MARKER])

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

/** cpSync 过滤器：排除一切点文件/点目录（.DS_Store 等）。 */
function skipDotfiles(src) {
  const base = src.split(sep).pop() ?? ""
  return !(base.startsWith(".") && base !== ".")
}

/** 把源目录内容复制为目标目录内容（target 自身保留 .disabled）。 */
function deployContents(fromDir, target) {
  const disabledPath = join(target, DISABLED_MARKER)
  const disabledBackup = existsSync(disabledPath) ? readFileSync(disabledPath) : null

  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(fromDir)) {
    if (!skipDotfiles(join(fromDir, entry))) continue
    cpSync(join(fromDir, entry), join(target, entry), {
      recursive: true,
      filter: skipDotfiles,
    })
  }
  if (disabledBackup !== null) {
    writeFileSync(disabledPath, disabledBackup)
  }
}

/** 递归收集部署根下的文件（相对路径，`/` 分隔；跳过 manifest.json/.disabled/点文件）。 */
function collectBundleFiles(rootDir) {
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(abs)
        continue
      }
      if (!entry.isFile()) continue
      const rel = relative(rootDir, abs).split(sep).join("/")
      if (HASH_EXCLUDED.has(rel)) continue
      files.push(rel)
    }
  }
  walk(rootDir)
  return files.sort()
}

/** 生成 `files` 清单并注入部署 manifest（spec §3.3：逐文件 sha256 + size）。 */
function injectFilesManifest(target) {
  const manifestPath = join(target, "manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const files = collectBundleFiles(target).map((rel) => {
    const bytes = readFileSync(join(target, rel))
    return {
      path: rel,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    }
  })
  manifest.files = files
  manifest.schemaVersion = 2
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
  return files.length
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
    } else if (existsSync(join(source, "index.html"))) {
      // 静态模式：仅 manifest + 入口 + assets（源码/文档不进运行时目录）。
      const staging = join(targetRoot, `.${id}.staging`)
      rmSync(staging, { recursive: true, force: true })
      mkdirSync(staging, { recursive: true })
      for (const entry of ["manifest.json", "index.html", "assets"]) {
        const from = join(source, entry)
        if (existsSync(from))
          cpSync(from, join(staging, entry), { recursive: true, filter: skipDotfiles })
      }
      deployContents(staging, target)
      rmSync(staging, { recursive: true, force: true })
    } else {
      console.warn(`[extensions] skip ${id}: no deployable index.html`)
      continue
    }

    // P3.1：部署完成后注入逐文件 hash 清单（宿主 ext_open 全量校验的依据）。
    const count = injectFilesManifest(target)
    console.log(`[extensions] synced ${id} -> ${target} (files manifest: ${count} entries)`)
    synced += 1
  }

  console.log(`[extensions] done (${synced} extension(s))`)
}

main()

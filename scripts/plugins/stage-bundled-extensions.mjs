#!/usr/bin/env node
/**
 * P3.4：把仓库 extensions/ 下的官方插件（bundled）产物组装到
 * `src-tauri/resources/extensions/<id>/`，供 `tauri build` 经
 * `bundle.resources` 打进正式包（tauri.conf.json → setup 时由宿主拷入
 * $APPDATA/extensions/，见 src-tauri/src/extension_host/bundle.rs）。
 *
 * 部署物选择与 sync-extensions.mjs 一致：
 * - `extensions/<id>/assets/index.html` 存在 → 构建产物模式（assets/ 即部署根）；
 * - 否则 `extensions/<id>/index.html` → 静态模式（manifest + 入口 + assets）。
 *
 * 部署完成后注入 manifest v2 `files` 清单（与 sync 共用 lib/extension-files.mjs）。
 * 产物不进 git（.gitignore 已覆盖 `src-tauri/resources/extensions/`；
 * 同级的 `resources/browser-extension/` 是 bench-companion 模板源文件，保持跟踪）。
 *
 * 用法：node scripts/plugins/stage-bundled-extensions.mjs
 * （`pnpm run extensions:stage`；tauri build 前由 beforeBuildCommand 链调用）
 */

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { injectFilesManifest, skipDotfiles } from "./lib/extension-files.mjs"

const REPO_EXTENSIONS = join(process.cwd(), "extensions")
/** 与 tauri.conf.json bundle.resources 的 key 保持一致（相对 src-tauri/）。 */
const STAGING_ROOT = join(process.cwd(), "src-tauri", "resources", "extensions")

function stage(id) {
  const source = join(REPO_EXTENSIONS, id)
  const target = join(STAGING_ROOT, id)
  if (!existsSync(join(source, "manifest.json"))) {
    console.warn(`[extensions:stage] skip ${id}: missing manifest.json`)
    return false
  }

  const builtIndex = join(source, "assets", "index.html")
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })

  if (existsSync(builtIndex)) {
    // 构建产物模式：assets/ 内即部署根（index.html + bundle/）。
    for (const entry of readdirSync(join(source, "assets"))) {
      if (!skipDotfiles(join(source, "assets", entry))) continue
      cpSync(join(source, "assets", entry), join(target, entry), {
        recursive: true,
        filter: skipDotfiles,
      })
    }
  } else if (existsSync(join(source, "index.html"))) {
    // 静态模式：仅 manifest + 入口 + assets。
    for (const entry of ["index.html", "assets"]) {
      const from = join(source, entry)
      if (existsSync(from)) {
        cpSync(from, join(target, entry), { recursive: true, filter: skipDotfiles })
      }
    }
  } else {
    console.warn(`[extensions:stage] skip ${id}: no deployable index.html`)
    return false
  }

  cpSync(join(source, "manifest.json"), join(target, "manifest.json"))
  const count = injectFilesManifest(target)
  console.log(`[extensions:stage] staged ${id} -> ${target} (files manifest: ${count} entries)`)
  return true
}

function main() {
  mkdirSync(STAGING_ROOT, { recursive: true })
  if (!existsSync(REPO_EXTENSIONS)) {
    // 无插件仓库也要保证 resources 目录存在（tauri resources 引用路径必须存在）。
    console.log("[extensions:stage] no extensions directory; created empty staging root")
    return
  }
  const ids = readdirSync(REPO_EXTENSIONS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  let staged = 0
  for (const id of ids) {
    if (stage(id)) staged += 1
  }
  console.log(`[extensions:stage] done (${staged} extension(s))`)
}

main()

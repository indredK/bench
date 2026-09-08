/**
 * P3.4：sync（dev 同步）与 stage（打包进 resources）共用的
 * manifest v2 `files` 清单工具。零三方依赖（Node built-ins only）。
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, relative, sep } from "node:path"

/** 与 src-tauri/src/extension_host/manifest.rs::EXT_DISABLED_MARKER 一致。 */
export const DISABLED_MARKER = ".disabled"
/** 宿主不入清单的固定项（spec §3.3：manifest.json 文件哈希无法自嵌套）。 */
export const HASH_EXCLUDED = new Set(["manifest.json", DISABLED_MARKER])

/** cpSync 过滤器：排除一切点文件/点目录（.DS_Store 等）。 */
export function skipDotfiles(src) {
  const base = src.split(sep).pop() ?? ""
  return !(base.startsWith(".") && base !== ".")
}

/** 递归收集部署根下的文件（相对路径，`/` 分隔；跳过 manifest.json/.disabled/点文件）。 */
export function collectBundleFiles(rootDir) {
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

/**
 * 生成 `files` 清单并注入部署 manifest（spec §3.3：逐文件 sha256 + size）。
 * 源 manifest 保持模板态（无 files）；清单只存在于部署产物中。
 */
export function injectFilesManifest(target) {
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

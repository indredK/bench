#!/usr/bin/env node
/**
 * 插件打包（P5 发布链路）：构建单个插件 → 注入 files 清单 → 打 zip →
 * 输出 registry 元数据（sha256/size/version），供 GitHub Release 与
 * 插件市场 registry.json 使用。
 *
 * 依赖宿主工作区（插件 `@` alias 指向 bench/src）——必须在 bench 仓库根执行；
 * CI 用法见各插件仓库 .github/workflows/release.yml。
 *
 * 用法：node scripts/plugins/pack-extension.mjs <id> [--out <dir>]
 * 产物：<out>/bench-ext-<id>-v<version>.zip + <out>/<id>.meta.json
 */

import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const require_ = createRequire(import.meta.url)
const { injectFilesManifest } = require_("./lib/extension-files.mjs")

const VITE_BIN = join(process.cwd(), "node_modules", ".bin", "vite")

function main() {
  const id = process.argv[2]
  const outIdx = process.argv.indexOf("--out")
  const outDir = resolve(outIdx !== -1 ? process.argv[outIdx + 1] : "./dist")
  if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error("[pack] usage: pack-extension.mjs <id> [--out <dir>]")
    process.exit(1)
  }
  const pluginDir = join(process.cwd(), "extensions", id)
  const manifestPath = join(pluginDir, "manifest.json")
  if (!existsSync(manifestPath)) {
    console.error(`[pack] extensions/${id}/manifest.json not found`)
    process.exit(1)
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const version = manifest.version
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`[pack] manifest version \`${version}\` must be X.Y.Z`)
    process.exit(1)
  }

  // 1) 构建（vite 产物 outDir = assets/）
  console.log(`[pack] building ${id} …`)
  const build = spawnSync(VITE_BIN, ["build", "--config", join(pluginDir, "vite.config.ts")], {
    stdio: "inherit",
    shell: process.platform === "win32",
  })
  if (build.status !== 0) {
    console.error(`[pack] vite build failed (exit ${build.status})`)
    process.exit(1)
  }

  // 2) 组装部署根：assets/* + manifest.json，注入 files 清单（复用共享模块）
  const staging = join(outDir, `__staging-${id}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  const skipDotfiles = (src) => {
    const base = src.split("/").pop().split("\\").pop()
    return !(base.startsWith(".") && base !== ".")
  }
  for (const entry of readdirSync(join(pluginDir, "assets"))) {
    if (!skipDotfiles(entry)) continue
    cpSync(join(pluginDir, "assets", entry), join(staging, entry), {
      recursive: true,
      filter: skipDotfiles,
    })
  }
  cpSync(manifestPath, join(staging, "manifest.json"))
  // 市场分发通道要求 manifest.distribution == "market"（宿主 ext_market_prepare 强制；
  // bundled 仅指应用包内随包分发的形态）。注入 files 清单前改写。
  const stagedManifest = JSON.parse(readFileSync(join(staging, "manifest.json"), "utf8"))
  stagedManifest.distribution = "market"
  writeFileSync(join(staging, "manifest.json"), JSON.stringify(stagedManifest, null, 2) + "\n")
  const fileCount = injectFilesManifest(staging)

  // 3) 打 zip（ubuntu/macos 自带 zip；发布 CI 跑在 ubuntu）
  mkdirSync(outDir, { recursive: true })
  const zipName = `bench-ext-${id}-v${version}.zip`
  const zipPath = join(outDir, zipName)
  rmSync(zipPath, { force: true })
  const zip = spawnSync("zip", ["-qr", zipPath, "."], { cwd: staging })
  if (zip.status !== 0) {
    console.error(`[pack] zip failed (exit ${zip.status})`)
    process.exit(1)
  }
  rmSync(staging, { recursive: true, force: true })

  const bytes = readFileSync(zipPath)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const meta = { id, version, file: zipName, sha256, size: bytes.length, fileCount }
  writeFileSync(join(outDir, `${id}.meta.json`), JSON.stringify(meta, null, 2) + "\n")
  console.log(
    `[pack] ${zipName} (${meta.size} bytes, sha256 ${sha256.slice(0, 12)}…, files ${fileCount})`,
  )
}

main()

#!/usr/bin/env node
/**
 * 生成/更新插件市场 registry.json（Bench extension-market 格式，spec §5.2）。
 *
 * 结构（P5 双仓库模型）：`<market-dir>/extensions/<id>/`（插件源，GitHub 组织
 * `kindred-plugin-market/plugin-market`）。registry.json 写回 `<market-dir>/registry.json`
 * （该仓库为市场索引真相源）。
 *
 * 两种模式：
 * - `--from-releases`（默认）：以 GitHub Release 资产的**真实字节**计算 sha256/size
 *   （宿主安装所见即所校验），downloadUrl = Release 资产 URL；
 * - `--local-pack`：对每个插件跑 pack-extension.mjs 拿本地构建 meta（用于发布前预览）。
 *
 * 用法：node scripts/plugins/update-extension-registry.mjs [--market <plugin-market 目录>] [--local-pack]
 */

import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const require_ = createRequire(import.meta.url)
require_("./lib/extension-files.mjs") // 确保共享模块存在（pack 依赖）

const ORG = "kindred-plugin-market"
const MARKET_REPO = "plugin-market"
const MARKET_DEFAULT = resolve(process.cwd(), "..", "kindred-plugin-market", MARKET_REPO)

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const valueOf = (name) => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}

const fromReleases = !flag("--local-pack")
const marketDir = resolve(valueOf("--market") ?? MARKET_DEFAULT)

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

async function main() {
  const extensionsDir = join(marketDir, "extensions")
  if (!existsSync(extensionsDir)) {
    console.error(`[registry] extensions dir not found: ${extensionsDir}`)
    process.exit(1)
  }

  const ids = readdirSync(extensionsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(extensionsDir, d.name, "manifest.json")))
    .map((d) => d.name)
    .sort()

  const entries = []
  for (const id of ids) {
    const manifest = JSON.parse(readFileSync(join(extensionsDir, id, "manifest.json"), "utf8"))
    const version = manifest.version
    const assetName = `bench-ext-${id}-v${version}.zip`
    const tag = `${id}-v${version}`
    let sha256
    let size

    if (fromReleases) {
      const rel = await fetchJson(
        `https://api.github.com/repos/${ORG}/${MARKET_REPO}/releases/tags/${tag}`,
      )
      const asset = (rel.assets ?? []).find((a) => a.name === assetName)
      if (!asset) throw new Error(`[registry] ${id}: asset ${assetName} missing on release ${tag}`)
      const res = await fetch(asset.browser_download_url)
      if (!res.ok) throw new Error(`[registry] ${id}: asset download failed (HTTP ${res.status})`)
      const bytes = Buffer.from(await res.arrayBuffer())
      sha256 = createHash("sha256").update(bytes).digest("hex")
      size = bytes.length
      console.log(`[registry] ${id}: release asset ${size} bytes, sha256 ${sha256.slice(0, 12)}…`)
    } else {
      const pack = spawnSync(
        process.execPath,
        [
          join(process.cwd(), "scripts", "plugins", "pack-extension.mjs"),
          id,
          "--out",
          join(marketDir, ".registry-dist"),
        ],
        { stdio: "inherit" },
      )
      if (pack.status !== 0) throw new Error(`[registry] pack ${id} failed`)
      const meta = JSON.parse(
        readFileSync(join(marketDir, ".registry-dist", `${id}.meta.json`), "utf8"),
      )
      rmSync(join(marketDir, ".registry-dist"), { recursive: true, force: true })
      sha256 = meta.sha256
      size = meta.size
      console.log(`[registry] ${id}: local pack ${size} bytes, sha256 ${sha256.slice(0, 12)}…`)
    }

    entries.push({
      id,
      display: manifest.display,
      description: {
        en: manifest.display.en,
        ...(manifest.display.zh ? { zh: manifest.display.zh } : {}),
      },
      publisher: { name: "Kindred Plugin Market" },
      versions: [
        {
          version,
          engines: manifest.engines ?? { bench: "*" },
          downloadUrl: `https://github.com/${ORG}/${MARKET_REPO}/releases/download/${tag}/${assetName}`,
          sha256,
          size,
          publishedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
          yanked: false,
        },
      ],
    })
  }

  const registry = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    extensions: entries,
    revoked: [],
  }
  const out = join(marketDir, "registry.json")
  writeFileSync(out, JSON.stringify(registry, null, 2) + "\n")
  console.log(`[registry] ${out} written (${entries.length} extension(s))`)
}

main().catch((error) => {
  console.error(`[registry] ${error.message}`)
  process.exit(1)
})

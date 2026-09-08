#!/usr/bin/env node
/**
 * 生成/更新插件市场 registry.json（Bench extension-market 格式，spec §5.2）。
 *
 * 结构（P5 双仓库模型）：`<market-dir>/extensions/<id>/`（插件源，GitHub 组织
 * `kindred-plugin-market/plugin-market`）。本脚本对每个插件跑 pack（构建 + 注入
 * files + zip）拿 sha256/size，downloadUrl 按 GitHub Release 资产模式推定：
 *   https://github.com/kindred-plugin-market/plugin-market/releases/download/<id>-v<version>/bench-ext-<id>-v<version>.zip
 * registry.json 写回 `<market-dir>/registry.json`（该仓库为市场索引真相源）。
 *
 * 用法：node scripts/plugins/update-extension-registry.mjs [--market <plugin-market 目录>]
 */

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { spawnSync } from "node:child_process"

const ORG = "kindred-plugin-market"
const MARKET_REPO = "plugin-market"

function main() {
  const idx = process.argv.indexOf("--market")
  const marketDir =
    idx !== -1
      ? resolve(process.argv[idx + 1])
      : resolve(process.cwd(), "..", "kindred-plugin-market", MARKET_REPO)

  const entries = []
  const pluginDirs = readdirSync(join(marketDir, "extensions"), { withFileTypes: true })
    .filter(
      (d) => d.isDirectory() && existsSync(join(marketDir, "extensions", d.name, "manifest.json")),
    )
    .map((d) => d.name)
    .sort()

  for (const id of pluginDirs) {
    // pack：构建 + 注入 files + zip + meta（构建产物临时目录，不入 git）
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
    if (pack.status !== 0) {
      console.error(`[registry] pack ${id} failed`)
      process.exit(1)
    }
    const meta = JSON.parse(
      readFileSync(join(marketDir, ".registry-dist", `${id}.meta.json`), "utf8"),
    )
    rmSync(join(marketDir, ".registry-dist"), { recursive: true, force: true })
    rmSync(join(marketDir, ".registry-dist"), { recursive: true, force: true })
    const manifest = JSON.parse(
      readFileSync(join(marketDir, "extensions", id, "manifest.json"), "utf8"),
    )
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
          version: meta.version,
          engines: manifest.engines ?? { bench: "*" },
          downloadUrl: `https://github.com/${ORG}/${MARKET_REPO}/releases/download/${id}-v${meta.version}/${meta.file}`,
          sha256: meta.sha256,
          size: meta.size,
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

main()

#!/usr/bin/env node
/**
 * 插件 i18n 自包含审计（P5）：插件文案必须完全随插件走（不指向宿主）——
 * 插件目录（plugin-market 仓库）将来整体作为独立发布单元。
 *
 * 扫描范围：每个插件自身源码 + 其经 `@/` 引用的宿主共享模块（UI/common/
 * shared/lib 组件）中的 `t()` 静态 key 与动态族，对照插件 locales（zh）。
 * 结构 parity（zh/en）由 Bench 的 check-i18n-guards 保证，这里只查
 * 「用到的 key 是否都在」。
 *
 * 插件来源（自动发现，二选一）：
 * - 默认：`<bench>/../kindred-plugin-market/plugin-market/extensions/`（真相源仓库）
 * - 兼容：`<bench>/extensions/`（若本地仍保留）
 *
 * 用法：pnpm run audit:ext-i18n（非零退出码 = 有缺口）
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(scriptDir, "..", "..") // Bench 仓库根（宿主共享模块来源）
const marketDefault = path.resolve(root, "..", "kindred-plugin-market", "plugin-market")

const args = process.argv.slice(2)
const valueOf = (name) => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}
const marketDir = path.resolve(valueOf("--market") ?? marketDefault)

/** 发现插件：优先 market 仓库，回退 Bench 本地 extensions/。 */
function discoverPlugins() {
  const candidates = [path.join(marketDir, "extensions"), path.join(root, "extensions")]
  for (const dir of candidates) {
    if (!existsSync(dir)) continue
    const ids = readdirSync(dir, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          existsSync(path.join(dir, d.name, "manifest.json")) &&
          existsSync(path.join(dir, d.name, "locales", "zh.json")),
      )
      .map((d) => d.name)
      .sort()
    if (ids.length > 0) return { base: dir, ids }
  }
  return { base: null, ids: [] }
}

const flatten = (obj, prefix = "") => {
  const keys = []
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object") keys.push(...flatten(v, key))
    else keys.push(key)
  }
  return keys
}

const walk = (dir, acc = []) => {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p)
  }
  return acc
}

function collectKeys(files) {
  const statics = new Set()
  const dynamics = []
  for (const f of files) {
    const src = readFileSync(f, "utf8")
    for (const m of src.matchAll(/\bt\(\s*["'`]([^"'`]+)["'`]/g)) {
      const raw = m[1]
      if (raw.includes("${")) dynamics.push({ file: f, raw })
      else if (/^[a-zA-Z][\w-]*(\.[\w-]+)+$/.test(raw)) statics.add(raw)
    }
  }
  return { statics: [...statics], dynamics }
}

function resolveHostFiles(specifiers) {
  const files = []
  for (const spec of specifiers) {
    const base = path.join(root, "src", spec.slice(2))
    if (existsSync(base) && statSync(base).isDirectory()) files.push(...walk(base))
    else for (const ext of [".ts", ".tsx"]) if (existsSync(base + ext)) files.push(base + ext)
  }
  return files
}

async function main() {
  const { base: pluginBase, ids: pluginIds } = discoverPlugins()
  if (pluginIds.length === 0) {
    console.log("[audit:ext-i18n] no plugins found (bench extensions/ is a pure base) — pass")
    process.exit(0)
  }
  console.log(`[audit:ext-i18n] plugins: ${pluginIds.join(", ")}`)

  let totalMissing = 0
  let clean = 0
  for (const pid of pluginIds) {
    const localePath = path.join(pluginBase, pid, "locales", "zh.json")
    const zh = JSON.parse(readFileSync(localePath, "utf8")).translation
    const pluginKeys = new Set(flatten(zh))

    const pluginFiles = walk(path.join(pluginBase, pid, "src"))
    const hostSpecifiers = new Set()
    for (const f of pluginFiles) {
      const src = readFileSync(f, "utf8")
      for (const m of src.matchAll(/from ["'](@\/[^"']+)["']/g)) hostSpecifiers.add(m[1])
    }
    const hostFiles = resolveHostFiles([...hostSpecifiers])
    const { statics, dynamics } = collectKeys([...pluginFiles, ...hostFiles])

    const missing = statics.filter((k) => !pluginKeys.has(k))
    const missingDyn = dynamics.filter(({ raw }) => {
      const family = raw.split("${")[0].replace(/\.$/, "")
      return ![...pluginKeys].some((k) => k.startsWith(family))
    })

    console.log(
      `== ${pid} == host modules: ${hostSpecifiers.size} | static keys ${statics.length} | families ${dynamics.length}`,
    )
    if (missing.length === 0 && missingDyn.length === 0) {
      clean += 1
      console.log("  ✓ self-contained")
      continue
    }
    totalMissing += missing.length + missingDyn.length
    for (const k of missing) console.log(`  ✗ missing static key: ${k}`)
    for (const d of missingDyn)
      console.log(`  ✗ missing dynamic family: ${d.raw}  (${path.relative(root, d.file)})`)
  }

  console.log(
    `\n[audit:ext-i18n] ${clean}/${pluginIds.length} self-contained; missing ${totalMissing}.`,
  )
  process.exit(totalMissing > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(`[audit:ext-i18n] ${error.message}`)
  process.exit(1)
})

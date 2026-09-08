#!/usr/bin/env node
/**
 * 插件 i18n 自包含审计（P5，用户约定：文案必须完全随插件走，不指向宿主——
 * 插件目录将来会整体搬到独立仓库）。
 *
 * 扫描范围：插件自身源码 + 其经 `@/` 引用的宿主共享模块
 * （UI 组件、common 组件、shared 组件、lib 等）中的 `t()` 静态 key
 * 与动态族，对照 `extensions/<id>/locales/zh.json`（结构 parity 由
 * check-i18n-guards 保证，这里只查"用到的 key 是否都在"）。
 *
 * 缺口处理约定：
 * - 插件自身源码缺 key → 补进插件 locales；
 * - 宿主共享组件缺 key → 补进插件 locales 的 common（宿主 common 演进时重跑本审计）；
 *   组件若被插件大量定制，考虑收编进插件或 P4.5 SDK（见 extension-workflow.md §11）。
 *
 * 用法：pnpm run audit:ext-i18n（非零退出码 = 有缺口）
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const PLUGINS = ["photo-triage", "terminology", "hardware", "clean-space"]

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

let totalMissing = 0
let cleanPlugins = 0

for (const pid of PLUGINS) {
  const localePath = path.join(root, "extensions", pid, "locales", "zh.json")
  if (!existsSync(localePath)) {
    console.error(`✗ ${pid}: locales/zh.json 缺失（文案未随插件自包含）`)
    totalMissing += 1
    continue
  }
  const zh = JSON.parse(readFileSync(localePath, "utf8")).translation
  const pluginKeys = new Set(flatten(zh))

  const pluginFiles = walk(path.join(root, "extensions", pid, "src"))
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
    `\n== ${pid} == 宿主依赖模块 ${hostSpecifiers.size} 个 / ${hostFiles.length} 文件；静态 key ${statics.length}、动态族 ${dynamics.length}`,
  )
  if (missing.length === 0 && missingDyn.length === 0) {
    cleanPlugins += 1
    console.log("  ✓ 文案自包含")
    continue
  }
  totalMissing += missing.length + missingDyn.length
  for (const k of missing) console.log(`  ✗ 缺失静态 key: ${k}`)
  for (const d of missingDyn) {
    console.log(`  ✗ 缺失动态族: ${d.raw}  (${path.relative(root, d.file)})`)
  }
}

console.log(
  `\n审计结果：${cleanPlugins}/${PLUGINS.length} 插件文案自包含；缺失 ${totalMissing} 项。`,
)
process.exit(totalMissing > 0 ? 1 : 0)

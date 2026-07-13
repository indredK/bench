import { readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"))
}

function readText(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8")
}

function get(obj, dottedKey) {
  return dottedKey.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function assert(condition, message) {
  if (!condition) {
    console.error(`i18n/static guard failed: ${message}`)
    process.exit(1)
  }
}

const en = readJson("src/i18n/locales/en.json")
const zh = readJson("src/i18n/locales/zh.json")

const requiredKeys = [
  "common.appTitle",
  "theme.sectionTitle",
  "portManager.errors.desktopOnly",
  "portManager.errors.killOneFailed",
  "portManager.errors.killAllFailed",
  "appManager.errors.scanFailed",
  "appManager.errors.updateCheckFailed",
  "appManager.errors.missingMacAppStoreId",
  "appManager.errors.noDownloadUrl",
  "appManager.errors.genericBatchFailure",
]

for (const key of requiredKeys) {
  assert(
    typeof get(en, key) === "string" && get(en, key).length > 0,
    `missing en locale key ${key}`,
  )
  assert(
    typeof get(zh, key) === "string" && get(zh, key).length > 0,
    `missing zh locale key ${key}`,
  )
}

const settingsDialog = readText("src/components/common/SettingsDialog.tsx")
assert(
  !settingsDialog.includes('"Port Manager - DevTools"'),
  "SettingsDialog should not hardcode English app title",
)
assert(
  !settingsDialog.includes('"端口管理器 - DevTools"'),
  "SettingsDialog should not hardcode Chinese app title",
)
assert(
  settingsDialog.includes('i18n.t("common.appTitle")'),
  "SettingsDialog should resolve title from i18n",
)
assert(
  settingsDialog.includes('t("theme.sectionTitle")'),
  "SettingsDialog should use dedicated theme section title",
)

// === Scan source files for statically-referenced i18n keys ===
// Walks src/, extracts every t("ns.key") / i18n.t("ns.key") literal, and
// verifies the key exists in both zh.json and en.json. Dynamic keys
// (t(`ns.${var}`)) are skipped since they can't be checked statically.

const SKIP_DIRS = new Set(["node_modules", "locales", "__tests__", "dist", ".git"])

function walkSrcDir(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      walkSrcDir(fullPath, files)
    } else if (/\.tsx?$/.test(entry)) {
      if (/\.(?:test|spec)\.tsx?$/.test(entry)) continue
      files.push(fullPath)
    }
  }
  return files
}

// Match t("ns.key") / t('ns.key') / i18n.t("ns.key").
// Requires at least one dot so plain t("cancel") (rare, usually a bug)
// and unrelated function calls like test("foo") are not picked up.
const STATIC_KEY_RE = /\bt\(\s*['"]([A-Za-z][\w-]*\.[\w.-]+)['"]/g

function extractStaticI18nKeys(content) {
  const keys = new Set()
  let match
  while ((match = STATIC_KEY_RE.exec(content)) !== null) {
    keys.add(match[1])
  }
  return keys
}

const sourceFiles = walkSrcDir(path.join(rootDir, "src"))
const usedKeys = new Map()
for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8")
  for (const key of extractStaticI18nKeys(content)) {
    if (!usedKeys.has(key)) usedKeys.set(key, [])
    const rel = path.relative(rootDir, file)
    if (!usedKeys.get(key).includes(rel)) usedKeys.get(key).push(rel)
  }
}

const missingKeys = []
for (const [key, files] of usedKeys) {
  const inZh = get(zh, key) !== undefined
  const inEn = get(en, key) !== undefined
  if (!inZh || !inEn) {
    missingKeys.push({ key, inZh, inEn, files })
  }
}

if (missingKeys.length > 0) {
  console.error("i18n/static guard failed: keys used in code but missing in locale files:")
  for (const { key, inZh, inEn, files } of missingKeys) {
    const missing = [!inZh && "zh", !inEn && "en"].filter(Boolean).join("+")
    console.error(`  ${key}  [missing: ${missing}]  (used in ${files[0]})`)
  }
  process.exit(1)
}

console.log(
  `Checked ${usedKeys.size} unique i18n keys across ${sourceFiles.length} source files.`,
)

// === Verify zh.json and en.json key sets are fully aligned ===

function collectLeafKeys(obj, prefix = "") {
  const keys = new Set()
  if (obj == null || typeof obj !== "object") return keys
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (value != null && typeof value === "object") {
      for (const k of collectLeafKeys(value, fullKey)) keys.add(k)
    } else {
      keys.add(fullKey)
    }
  }
  return keys
}

const zhLeafKeys = collectLeafKeys(zh)
const enLeafKeys = collectLeafKeys(en)

const onlyInZh = [...zhLeafKeys].filter((k) => !enLeafKeys.has(k)).sort()
const onlyInEn = [...enLeafKeys].filter((k) => !zhLeafKeys.has(k)).sort()

if (onlyInZh.length > 0 || onlyInEn.length > 0) {
  console.error("i18n/static guard failed: zh.json and en.json key sets are out of sync.")
  if (onlyInZh.length > 0) {
    console.error(`  Keys only in zh.json (missing in en.json): ${onlyInZh.length}`)
    for (const k of onlyInZh) console.error(`    ${k}`)
  }
  if (onlyInEn.length > 0) {
    console.error(`  Keys only in en.json (missing in zh.json): ${onlyInEn.length}`)
    for (const k of onlyInEn) console.error(`    ${k}`)
  }
  process.exit(1)
}

console.log(
  `Locale alignment check passed: ${zhLeafKeys.size} keys in both zh.json and en.json.`,
)

console.log("Frontend i18n/static guards passed.")

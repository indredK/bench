import { readdirSync, existsSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * 文档 ↔ 代码 一致性门禁
 *
 * 校验 coding-standards.md §11 的强制约定：
 *   1. 每个 src/features/<id> 有对应 docs/modules/<id>（反之亦然）
 *   2. 每个 docs/modules/<id> 至少含 README.md + roadmap.md
 *   3. 无孤儿文档目录（有文档无 feature）
 *
 * 参照 check-i18n-guards.mjs：失败即 process.exit(1)，供 lint / pre-commit 调用。
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

const FEATURES_DIR = path.join(rootDir, "src", "features")
const MODULES_DIR = path.join(rootDir, "docs", "modules")

// 非 feature 的基础设施目录/文件，不参与对齐校验
const FEATURE_IGNORE = new Set([])
// docs/modules 下非模块的条目（模板、索引等）
const MODULE_IGNORE = new Set(["README.md", "_bugs-template.md"])

const REQUIRED_MODULE_FILES = ["README.md", "roadmap.md"]

function listDirs(dir, ignore) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => !name.startsWith(".") && !ignore.has(name))
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .sort()
}

const featureIds = listDirs(FEATURES_DIR, FEATURE_IGNORE)
const moduleIds = listDirs(MODULES_DIR, MODULE_IGNORE)

const errors = []

// 1 + 3. 双向对齐
const featureSet = new Set(featureIds)
const moduleSet = new Set(moduleIds)

for (const id of featureIds) {
  if (!moduleSet.has(id)) {
    errors.push(
      `feature 缺文档：src/features/${id}/ 存在，但 docs/modules/${id}/ 缺失` +
        `（coding-standards §11.2 强制：新增 feature 须同步创建文档目录）`,
    )
  }
}

for (const id of moduleIds) {
  if (!featureSet.has(id)) {
    errors.push(
      `孤儿文档：docs/modules/${id}/ 存在，但 src/features/${id}/ 缺失` +
        `（若为已删除 feature，请一并移除文档目录；若是基础设施，请加入 MODULE_IGNORE）`,
    )
  }
}

// 2. 必需文件
for (const id of moduleIds) {
  for (const file of REQUIRED_MODULE_FILES) {
    const p = path.join(MODULES_DIR, id, file)
    if (!existsSync(p)) {
      errors.push(`模块文件缺失：docs/modules/${id}/${file}（coding-standards §11.2 强制）`)
    }
  }
}

if (errors.length > 0) {
  console.error("doc/code consistency guard failed:")
  for (const e of errors) console.error(`  ✗ ${e}`)
  console.error(`\n共 ${errors.length} 项。修复后重试，或按提示更新文档结构。`)
  process.exit(1)
}

console.log(
  `✓ doc/code consistency: ${featureIds.length} features ↔ ${moduleIds.length} module docs 对齐，必需文件齐全`,
)

/**
 * macOS Remainder / macOS 余量计算: pure function only; 纯函数.
 * 计算 macOS 系统占用 = 磁盘已用 - 已知分类总和，并维护固定排序。
 *
 * 后端已通过 `build_macos_category` 构造 macOS 核心系统与 remainder 明细。
 * 当后端 emit 的 incoming.id === "macos" 时，直接使用后端值（含子项），
 * 不重新计算 placeholder remainder。
 */
import type { StorageOverview, StorageCategory } from "@/lib/tauri/types/clean-space"

const CATEGORY_ORDER: readonly string[] = [
  "applications",
  "downloads",
  "documents",
  "system_data",
  "app_data",
  "other_users",
  "macos",
  "developer",
]

function sortCategories(categories: StorageCategory[]): StorageCategory[] {
  return [...categories].sort((a, b) => {
    return CATEGORY_ORDER.indexOf(a.id) - CATEGORY_ORDER.indexOf(b.id)
  })
}

function mergeCategory(
  currentCategories: StorageCategory[],
  incoming: StorageCategory,
): StorageCategory[] {
  const existing = currentCategories.find((category) => category.id === incoming.id)
  const merged = existing
    ? {
        ...incoming,
        items: incoming.items.length > 0 ? incoming.items : existing.items,
      }
    : incoming
  const withoutDup = currentCategories.filter((category) => category.id !== incoming.id)
  return [...withoutDup, merged]
}

/**
 * 给定当前 overview、磁盘信息和新增分类，返回包含 macOS 余量分类的新 overview。
 * 若前置条件不满足（首次扫描 / 无磁盘信息），返回 null 由调用方走简单追加路径。
 */
export function addMacOsRemainderCategory(
  overview: StorageOverview | null,
  diskInfo: { diskTotal: number; diskUsed: number } | null,
  incoming: StorageCategory,
): StorageOverview | null {
  if (!overview || !diskInfo) return null

  // If the backend emitted the macOS category (with sub-items from
  // `build_macos_category`), use it directly instead of recomputing a
  // single-item remainder.
  if (incoming.id === "macos") {
    const allCategories = sortCategories(mergeCategory(overview.categories, incoming))
    return { ...overview, categories: allCategories }
  }

  const categories = mergeCategory(
    overview.categories.filter((category) => category.id !== "macos"),
    incoming,
  )

  // macOS remainder = disk_used - sum(known category bytes)
  const knownBytes = categories.reduce((sum, c) => sum + c.total_bytes, 0)
  const macosBytes = Math.max(0, diskInfo.diskUsed - knownBytes)

  const macosCategory: StorageCategory = {
    id: "macos",
    // canonical value; frontend translates via t("cleanSpace.categories.macos")
    name: "macOS",
    color: "var(--chart-7)",
    total_bytes: macosBytes,
    items: [
      {
        id: "macos_system",
        // canonical value; informational only
        name: "macOS System",
        category_id: "macos",
        risk_level: "safe",
        size_bytes: macosBytes,
        command: "",
        is_cleanable: false,
        protection_kind: "read_only_system",
        protection_reason: "macOS system files are required for system stability",
        path: "/System",
        files: "",
        reason: "macOS system files (read-only, informational)",
        priority: "P2",
        score: 0,
      },
    ],
  }

  // Remove previous macOS placeholder if present, then insert at fixed position
  const filtered = categories.filter((c) => c.id !== "macos")
  const allCategories = sortCategories([...filtered, macosCategory])

  return { ...overview, categories: allCategories }
}

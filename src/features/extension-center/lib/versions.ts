import type {
  MarketExtensionSummary,
  MarketListing,
  MarketVersionSummary,
} from "@/lib/tauri/types/extension-center"

/** 数字段比较（与后端 `version_at_least` 同口径）：a > b 返回正数。 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) =>
    value
      .split(".")
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0)
  const [left, right] = [parse(a), parse(b)]
  for (let index = 0; index < 3; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * 市场里该插件当前可装的最新版本：未撤回的最高版本。
 * 必须按数字段比较 —— localeCompare 会把 0.10.0 排在 0.9.0 之前，
 * 导致真正的最新版被判「已装」而整颗按钮不渲染。
 */
export function latestInstallable(entry: MarketExtensionSummary): MarketVersionSummary | undefined {
  return [...entry.versions]
    .filter((version) => !version.yanked)
    .sort((a, b) => compareVersions(b.version, a.version))[0]
}

/**
 * 已安装插件的可更新版本：id → 目标版本。
 * 只收「最新可装版本比本地新、且宿主版本兼容、且未被吊销」的条目，
 * 不满足的不提示更新（点了也装不上，只会制造噪音）。
 */
export function findAvailableUpdates(listing: MarketListing | null): Record<string, string> {
  if (!listing) return {}
  const revoked = new Set(listing.revokedHits.map((hit) => hit.id))
  const updates: Record<string, string> = {}
  for (const entry of listing.extensions) {
    if (revoked.has(entry.id)) continue
    const latest = latestInstallable(entry)
    if (latest?.updateAvailable && latest.compatible) updates[entry.id] = latest.version
  }
  return updates
}

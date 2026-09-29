import type { HealthCheckItem, HealthScanResult } from "@/lib/tauri/types/network-probe"

export const HEALTH_OVERVIEW_STATUSES = ["pass", "warn", "fail", "error", "skip"] as const

export type HealthOverviewStatus = (typeof HEALTH_OVERVIEW_STATUSES)[number]
export type HealthOverviewState =
  "scanning" | "notRun" | "cancelled" | "issues" | "attention" | "partial" | "healthy"

export interface HealthOverviewSummary {
  state: HealthOverviewState
  counts: Record<HealthOverviewStatus, number>
  unknownCount: number
  total: number
}

export function summarizeHealthOverview(
  result: HealthScanResult | null,
  loading: boolean,
  streamingItems: HealthCheckItem[] = [],
): HealthOverviewSummary {
  const items = loading ? streamingItems : (result?.items ?? [])
  const counts: Record<HealthOverviewStatus, number> = {
    pass: 0,
    warn: 0,
    fail: 0,
    error: 0,
    skip: 0,
  }
  let unknownCount = 0

  for (const item of items) {
    if (HEALTH_OVERVIEW_STATUSES.includes(item.status as HealthOverviewStatus)) {
      counts[item.status as HealthOverviewStatus] += 1
    } else {
      unknownCount += 1
    }
  }

  let state: HealthOverviewState
  if (loading) state = "scanning"
  else if (!result) state = "notRun"
  else if (result.cancelled) state = "cancelled"
  else if (counts.fail > 0) state = "issues"
  else if (counts.error > 0 || counts.skip > 0 || unknownCount > 0 || items.length === 0) {
    state = "partial"
  } else if (counts.warn > 0) state = "attention"
  else state = "healthy"

  return {
    state,
    counts,
    unknownCount,
    total: items.length,
  }
}

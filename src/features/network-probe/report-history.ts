import type {
  HealthCheckItem,
  HealthOpinion,
  HealthScanResult,
} from "@/lib/tauri/types/network-probe"

export interface HealthReportSnapshot extends HealthScanResult {
  /** Timestamp when Bench saved the scan locally. Older snapshots have no timestamp. */
  savedAt?: number
}

export type HealthCheckChangeKind = "added" | "removed" | "changed" | "unchanged"

export interface HealthCheckChange {
  key: string
  before: HealthCheckItem | null
  after: HealthCheckItem | null
  kind: HealthCheckChangeKind
}

export type HealthOpinionChangeKind = "added" | "removed" | "changed"

export interface HealthOpinionChange {
  id: string
  before: HealthOpinion | null
  after: HealthOpinion | null
  kind: HealthOpinionChangeKind
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isHealthCheckItem(value: unknown): value is HealthCheckItem {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.layer === "string" &&
    typeof value.status === "string" &&
    (value.detail === undefined || typeof value.detail === "string") &&
    (value.commandHint === undefined || typeof value.commandHint === "string")
  )
}

function isHealthOpinion(value: unknown): value is HealthOpinion {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.severity === "string" &&
    Array.isArray(value.relatedKeys) &&
    value.relatedKeys.every((key) => typeof key === "string") &&
    typeof value.titleKey === "string" &&
    typeof value.bodyKey === "string"
  )
}

function isHealthReportSnapshot(value: unknown): value is HealthReportSnapshot {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(isHealthCheckItem) &&
    Array.isArray(value.opinions) &&
    value.opinions.every(isHealthOpinion) &&
    typeof value.elapsedMs === "number" &&
    Number.isFinite(value.elapsedMs) &&
    typeof value.sessionId === "string" &&
    value.sessionId.length > 0 &&
    typeof value.cancelled === "boolean" &&
    typeof value.commandHint === "string" &&
    (value.savedAt === undefined ||
      (typeof value.savedAt === "number" && Number.isFinite(value.savedAt)))
  )
}

/** Keep legacy snapshots readable and leave malformed localStorage untouched for recovery. */
export function parseHealthReportHistory(raw: string | null): HealthReportSnapshot[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const seenSessionIds = new Set<string>()
    return parsed
      .filter(isHealthReportSnapshot)
      .filter((snapshot) => {
        if (seenSessionIds.has(snapshot.sessionId)) return false
        seenSessionIds.add(snapshot.sessionId)
        return true
      })
      .slice(0, 10)
  } catch {
    return []
  }
}

export function compareHealthChecks(
  before: HealthScanResult,
  after: HealthScanResult,
): HealthCheckChange[] {
  const beforeByKey = new Map(before.items.map((item) => [item.key, item]))
  const afterByKey = new Map(after.items.map((item) => [item.key, item]))
  const keys = [
    ...new Set([...before.items.map((item) => item.key), ...after.items.map((item) => item.key)]),
  ]

  return keys.map((key) => {
    const oldItem = beforeByKey.get(key) ?? null
    const newItem = afterByKey.get(key) ?? null
    const kind: HealthCheckChangeKind = !oldItem
      ? "added"
      : !newItem
        ? "removed"
        : oldItem.layer === newItem.layer &&
            oldItem.status === newItem.status &&
            oldItem.detail === newItem.detail
          ? "unchanged"
          : "changed"

    return { key, before: oldItem, after: newItem, kind }
  })
}

function sameOpinion(before: HealthOpinion, after: HealthOpinion): boolean {
  const beforeRelatedKeys = [...before.relatedKeys].sort()
  const afterRelatedKeys = [...after.relatedKeys].sort()
  return (
    before.severity === after.severity &&
    before.titleKey === after.titleKey &&
    before.bodyKey === after.bodyKey &&
    beforeRelatedKeys.length === afterRelatedKeys.length &&
    beforeRelatedKeys.every((key, index) => key === afterRelatedKeys[index])
  )
}

export function compareHealthOpinions(
  before: HealthScanResult,
  after: HealthScanResult,
): HealthOpinionChange[] {
  const beforeById = new Map(before.opinions.map((opinion) => [opinion.id, opinion]))
  const afterById = new Map(after.opinions.map((opinion) => [opinion.id, opinion]))
  const ids = [
    ...new Set([
      ...before.opinions.map((opinion) => opinion.id),
      ...after.opinions.map((opinion) => opinion.id),
    ]),
  ]

  return ids.flatMap((id) => {
    const oldOpinion = beforeById.get(id) ?? null
    const newOpinion = afterById.get(id) ?? null
    if (oldOpinion && newOpinion && sameOpinion(oldOpinion, newOpinion)) return []

    return [
      {
        id,
        before: oldOpinion,
        after: newOpinion,
        kind: !oldOpinion ? "added" : !newOpinion ? "removed" : "changed",
      },
    ]
  })
}

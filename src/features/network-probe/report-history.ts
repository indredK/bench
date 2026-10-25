import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

/** Local persistence metadata. It is intentionally not part of the backend IPC DTO. */
export type HealthReportSnapshot = HealthScanResult & { savedAt?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

type PersistedHealthReport = HealthScanResult & { savedAt?: unknown }

function isHealthReportSnapshot(value: unknown): value is PersistedHealthReport {
  if (!isRecord(value)) return false
  if (
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    !Number.isFinite(value.elapsedMs) ||
    typeof value.cancelled !== "boolean" ||
    typeof value.commandHint !== "string" ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.opinions)
  ) {
    return false
  }

  const validItems = value.items.every(
    (item) =>
      isRecord(item) &&
      typeof item.key === "string" &&
      typeof item.layer === "string" &&
      typeof item.status === "string" &&
      (item.detail === undefined || typeof item.detail === "string") &&
      (item.commandHint === undefined || typeof item.commandHint === "string"),
  )
  const validOpinions = value.opinions.every(
    (opinion) =>
      isRecord(opinion) &&
      typeof opinion.id === "string" &&
      typeof opinion.severity === "string" &&
      isStringArray(opinion.relatedKeys) &&
      typeof opinion.titleKey === "string" &&
      typeof opinion.bodyKey === "string",
  )
  return validItems && validOpinions
}

/** Parse defensively so damaged or old localStorage data cannot crash the report view. */
export function parseReportHistory(raw: string | null): HealthReportSnapshot[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const seen = new Set<string>()
    const snapshots: HealthReportSnapshot[] = []
    for (const entry of parsed) {
      if (!isHealthReportSnapshot(entry) || seen.has(entry.sessionId)) continue
      seen.add(entry.sessionId)
      const { savedAt, ...result } = entry
      const snapshot: HealthReportSnapshot = result
      if (typeof savedAt === "string" && Number.isFinite(Date.parse(savedAt))) {
        snapshot.savedAt = savedAt
      }
      snapshots.push(snapshot)
      if (snapshots.length === 10) break
    }
    return snapshots
  } catch {
    return []
  }
}

export interface HealthCheckStatusChange {
  key: string
  beforeStatus?: string
  afterStatus?: string
}

/** Compare stable status codes only; diagnostic details may contain volatile local addresses. */
export function compareHealthCheckStatuses(
  before: HealthReportSnapshot,
  after: HealthReportSnapshot,
): HealthCheckStatusChange[] {
  const beforeByKey = new Map(before.items.map((item) => [item.key, item.status]))
  const afterByKey = new Map(after.items.map((item) => [item.key, item.status]))
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()])

  return [...keys]
    .filter((key) => beforeByKey.get(key) !== afterByKey.get(key))
    .map((key) => ({
      key,
      beforeStatus: beforeByKey.get(key),
      afterStatus: afterByKey.get(key),
    }))
}

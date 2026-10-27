import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

export interface HealthReportSnapshot {
  result: HealthScanResult
  /** Null for snapshots written before timestamp support was added. */
  capturedAt: string | null
}

const HISTORY_LIMIT = 10
const MAX_STORAGE_CHARS = 1_000_000
const MAX_ITEMS_PER_SCAN = 512

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isHealthScanResult(value: unknown): value is HealthScanResult {
  if (!isRecord(value)) return false
  if (
    !Array.isArray(value.items) ||
    value.items.length > MAX_ITEMS_PER_SCAN ||
    !Array.isArray(value.opinions) ||
    value.opinions.length > MAX_ITEMS_PER_SCAN ||
    typeof value.elapsedMs !== "number" ||
    !Number.isFinite(value.elapsedMs) ||
    typeof value.sessionId !== "string" ||
    typeof value.cancelled !== "boolean" ||
    typeof value.commandHint !== "string"
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
      Array.isArray(opinion.relatedKeys) &&
      opinion.relatedKeys.every((key) => typeof key === "string") &&
      typeof opinion.titleKey === "string" &&
      typeof opinion.bodyKey === "string",
  )

  return validItems && validOpinions
}

function parseTimestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null
}

/** Load current snapshot envelopes and migrate the original bare-result array. */
export function parseReportHistory(raw: string | null): HealthReportSnapshot[] {
  if (!raw || raw.length > MAX_STORAGE_CHARS) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const snapshots: HealthReportSnapshot[] = []
    for (const entry of parsed) {
      if (isRecord(entry) && isHealthScanResult(entry.result)) {
        snapshots.push({ result: entry.result, capturedAt: parseTimestamp(entry.capturedAt) })
      } else if (isHealthScanResult(entry)) {
        snapshots.push({ result: entry, capturedAt: null })
      }
      if (snapshots.length === HISTORY_LIMIT) break
    }
    return snapshots
  } catch {
    return []
  }
}

export function createReportSnapshot(
  result: HealthScanResult,
  capturedAt = new Date().toISOString(),
): HealthReportSnapshot {
  return { result, capturedAt }
}

export function serializeReportHistory(history: HealthReportSnapshot[]): string {
  const retained = history.slice(0, HISTORY_LIMIT)
  let serialized = JSON.stringify(retained)
  while (retained.length > 0 && serialized.length > MAX_STORAGE_CHARS) {
    retained.pop()
    serialized = JSON.stringify(retained)
  }
  return serialized
}

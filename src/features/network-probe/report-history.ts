import type {
  HealthCheckItem,
  HealthOpinion,
  HealthScanResult,
} from "@/lib/tauri/types/network-probe"

export const REPORT_HISTORY_LIMIT = 10

export interface HealthReportSnapshot {
  capturedAt: number | null
  result: HealthReportSnapshotResult
}

export interface HealthReportSnapshotResult {
  items: Array<Pick<HealthCheckItem, "key" | "layer" | "status">>
  opinions: Array<Pick<HealthOpinion, "id" | "severity">>
  elapsedMs: number
  sessionId: string
}

export type HealthCheckChangeKind =
  "improved" | "worsened" | "changed" | "unchanged" | "added" | "removed"

export interface HealthCheckChange {
  key: string
  previousStatus?: string
  currentStatus?: string
  kind: HealthCheckChangeKind
}

export interface HealthReportComparison {
  checks: HealthCheckChange[]
  counts: Record<HealthCheckChangeKind, number>
  addedOpinionCount: number
  resolvedOpinionCount: number
}

const HEALTH_STATUS_RANK: Record<string, number> = {
  fail: 0,
  warn: 1,
  pass: 2,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isHealthScanResult(value: unknown): value is HealthScanResult {
  if (!isRecord(value)) return false
  return (
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.key === "string" &&
        typeof item.layer === "string" &&
        typeof item.status === "string" &&
        (item.detail === undefined || typeof item.detail === "string") &&
        (item.commandHint === undefined || typeof item.commandHint === "string"),
    ) &&
    Array.isArray(value.opinions) &&
    value.opinions.every(
      (opinion) =>
        isRecord(opinion) &&
        typeof opinion.id === "string" &&
        typeof opinion.severity === "string" &&
        Array.isArray(opinion.relatedKeys) &&
        opinion.relatedKeys.every((key) => typeof key === "string") &&
        typeof opinion.titleKey === "string" &&
        typeof opinion.bodyKey === "string",
    ) &&
    typeof value.elapsedMs === "number" &&
    Number.isFinite(value.elapsedMs) &&
    typeof value.sessionId === "string" &&
    value.cancelled === false &&
    typeof value.commandHint === "string"
  )
}

function isHealthReportSnapshotResult(value: unknown): value is HealthReportSnapshotResult {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.key === "string" &&
        typeof item.layer === "string" &&
        typeof item.status === "string",
    ) &&
    Array.isArray(value.opinions) &&
    value.opinions.every(
      (opinion) =>
        isRecord(opinion) && typeof opinion.id === "string" && typeof opinion.severity === "string",
    ) &&
    typeof value.elapsedMs === "number" &&
    Number.isFinite(value.elapsedMs) &&
    typeof value.sessionId === "string"
  )
}

function sanitizeResult(result: HealthScanResult): HealthReportSnapshotResult {
  return {
    items: result.items.map(({ key, layer, status }) => ({ key, layer, status })),
    opinions: result.opinions.map(({ id, severity }) => ({ id, severity })),
    elapsedMs: result.elapsedMs,
    sessionId: result.sessionId,
  }
}

function sanitizeSnapshotResult(result: HealthReportSnapshotResult): HealthReportSnapshotResult {
  return {
    items: result.items.map(({ key, layer, status }) => ({ key, layer, status })),
    opinions: result.opinions.map(({ id, severity }) => ({ id, severity })),
    elapsedMs: result.elapsedMs,
    sessionId: result.sessionId,
  }
}

function parseSnapshot(value: unknown): HealthReportSnapshot | null {
  if (!isRecord(value)) return null
  let capturedAt: number | null
  if (value.capturedAt === null) capturedAt = null
  else if (typeof value.capturedAt === "number" && Number.isFinite(value.capturedAt)) {
    capturedAt = value.capturedAt
  } else return null

  if (isHealthScanResult(value.result)) {
    return {
      capturedAt:
        capturedAt !== null && Number.isFinite(new Date(capturedAt).getTime()) ? capturedAt : null,
      result: sanitizeResult(value.result),
    }
  }
  if (!isHealthReportSnapshotResult(value.result)) return null
  return {
    capturedAt:
      capturedAt !== null && Number.isFinite(new Date(capturedAt).getTime()) ? capturedAt : null,
    result: sanitizeSnapshotResult(value.result),
  }
}

export function createHealthReportSnapshot(
  scan: HealthScanResult,
  capturedAt: number,
): HealthReportSnapshot {
  return { capturedAt, result: sanitizeResult(scan) }
}

/** Decode current snapshots and migrate the legacy array of raw health scan results. */
export function decodeReportHistory(raw: string | null): HealthReportSnapshot[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .flatMap((entry): HealthReportSnapshot[] => {
        const snapshot = parseSnapshot(entry)
        if (snapshot) return [snapshot]
        if (isHealthScanResult(entry)) {
          return [{ capturedAt: null, result: sanitizeResult(entry) }]
        }
        return []
      })
      .slice(0, REPORT_HISTORY_LIMIT)
  } catch {
    return []
  }
}

export function encodeReportHistory(history: HealthReportSnapshot[]): string {
  return JSON.stringify(history.slice(0, REPORT_HISTORY_LIMIT))
}

function toStatusMap(result: HealthReportSnapshotResult): Map<string, string> {
  return new Map(result.items.map((item) => [item.key, item.status]))
}

function classifyStatusChange(
  previousStatus: string,
  currentStatus: string,
): HealthCheckChangeKind {
  if (previousStatus === currentStatus) return "unchanged"
  const previousRank = HEALTH_STATUS_RANK[previousStatus]
  const currentRank = HEALTH_STATUS_RANK[currentStatus]
  if (previousRank === undefined || currentRank === undefined) return "changed"
  return currentRank > previousRank ? "improved" : "worsened"
}

export function compareHealthReports(
  previous: HealthReportSnapshotResult,
  current: HealthReportSnapshotResult,
): HealthReportComparison {
  const previousStatuses = toStatusMap(previous)
  const currentStatuses = toStatusMap(current)
  const keys = [...new Set([...previousStatuses.keys(), ...currentStatuses.keys()])]
  const checks = keys.map((key): HealthCheckChange => {
    const previousStatus = previousStatuses.get(key)
    const currentStatus = currentStatuses.get(key)
    const kind: HealthCheckChangeKind =
      previousStatus === undefined
        ? "added"
        : currentStatus === undefined
          ? "removed"
          : classifyStatusChange(previousStatus, currentStatus)
    return { key, previousStatus, currentStatus, kind }
  })

  const counts: Record<HealthCheckChangeKind, number> = {
    improved: 0,
    worsened: 0,
    changed: 0,
    unchanged: 0,
    added: 0,
    removed: 0,
  }
  for (const check of checks) counts[check.kind] += 1

  const previousOpinions = new Set(previous.opinions.map((opinion) => opinion.id))
  const currentOpinions = new Set(current.opinions.map((opinion) => opinion.id))

  return {
    checks,
    counts,
    addedOpinionCount: [...currentOpinions].filter((id) => !previousOpinions.has(id)).length,
    resolvedOpinionCount: [...previousOpinions].filter((id) => !currentOpinions.has(id)).length,
  }
}

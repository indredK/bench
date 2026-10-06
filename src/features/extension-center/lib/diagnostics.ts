export const RUNTIME_DIAGNOSTIC_KINDS = [
  "window-error",
  "unhandled-rejection",
  "console.error",
  "boot",
] as const

export type RuntimeDiagnosticKind = (typeof RUNTIME_DIAGNOSTIC_KINDS)[number]
export type RuntimeDiagnosticFilter = "all" | RuntimeDiagnosticKind | "other"

export interface CategorizedRuntimeDiagnostic {
  line: string
  kind: RuntimeDiagnosticKind | "other"
}

const KNOWN_KINDS = new Set<string>(RUNTIME_DIAGNOSTIC_KINDS)

export function categorizeRuntimeDiagnostics(lines: string[]): CategorizedRuntimeDiagnostic[] {
  return lines.map((line) => {
    let kind: unknown
    try {
      const value: unknown = JSON.parse(line)
      if (typeof value === "object" && value !== null && "kind" in value) {
        kind = value.kind
      }
    } catch {
      // Keep malformed and legacy records visible under "Other".
    }

    return {
      line,
      kind:
        typeof kind === "string" && KNOWN_KINDS.has(kind)
          ? (kind as RuntimeDiagnosticKind)
          : "other",
    }
  })
}

export function countRuntimeDiagnostics(
  records: CategorizedRuntimeDiagnostic[],
): Record<RuntimeDiagnosticFilter, number> {
  const counts: Record<RuntimeDiagnosticFilter, number> = {
    all: records.length,
    "window-error": 0,
    "unhandled-rejection": 0,
    "console.error": 0,
    boot: 0,
    other: 0,
  }

  for (const record of records) counts[record.kind] += 1
  return counts
}

export function filterRuntimeDiagnostics(
  records: CategorizedRuntimeDiagnostic[],
  filter: RuntimeDiagnosticFilter,
): CategorizedRuntimeDiagnostic[] {
  return filter === "all" ? records : records.filter((record) => record.kind === filter)
}

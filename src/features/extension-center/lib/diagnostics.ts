export type DiagnosticSource = "audit" | "runtime"

export interface DiagnosticEntry {
  id: string
  source: DiagnosticSource
  kind: string | null
  extensionId: string | null
  version: string | null
  timestamp: string | null
  detail: string
  location: string | null
  raw: string
  searchableText: string
}

const MAX_DISPLAY_CHARS = 2_000

function stringField(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function truncate(value: string, max = MAX_DISPLAY_CHARS): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

function extensionIdFromUrl(url: string | null): string | null {
  if (!url) return null
  const match = url.match(/\/ext\/([a-z][a-z0-9-]*)(?:\/|$)/i)
  return match?.[1] ?? null
}

export function parseDiagnosticLine(
  line: string,
  source: DiagnosticSource,
  index: number,
): DiagnosticEntry {
  let record: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(line)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      record = parsed as Record<string, unknown>
    }
  } catch {
    // Preserve malformed local log rows as readable text instead of hiding them.
  }

  const kind = stringField(record, source === "audit" ? "event" : "kind", "type")
  const url = stringField(record, "url")
  const extensionId = stringField(record, "id", "extensionId") ?? extensionIdFromUrl(url)
  const version = stringField(record, "version")
  const timestamp = stringField(record, "ts", "timestamp", "time")
  const detail = truncate(stringField(record, "reason", "message") ?? line)
  const sourceFile = stringField(record, "source")
  const lineNumber = typeof record.line === "number" ? `:${record.line}` : ""
  const location = sourceFile ? `${sourceFile}${lineNumber}` : url
  const searchableText = [kind, extensionId, version, timestamp, detail, location]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase()

  return {
    id: `${source}-${index}-${kind ?? "unknown"}`,
    source,
    kind,
    extensionId,
    version,
    timestamp,
    detail,
    location: location ? truncate(location, 500) : null,
    raw: truncate(line),
    searchableText,
  }
}

export function filterDiagnosticEntries(
  entries: DiagnosticEntry[],
  kind: string,
  query: string,
): DiagnosticEntry[] {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return entries.filter((entry) => {
    if (kind !== "all" && entry.kind !== kind) return false
    return !normalizedQuery || entry.searchableText.includes(normalizedQuery)
  })
}

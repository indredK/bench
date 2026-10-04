import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getExtensionDiagnostics } from "@/lib/tauri/commands/extension-center"
import type { ExtensionDiagnostics } from "@/lib/tauri/types/extension-center"
import { parseCommandError } from "@/lib/tauri/errors"
import type { AppErrorShape } from "@/lib/tauri/errors"
import { cn } from "@/lib/utils"
import {
  filterDiagnosticEntries,
  parseDiagnosticLine,
  type DiagnosticEntry,
  type DiagnosticSource,
} from "@/features/extension-center/lib/diagnostics"

const AUDIT_EVENT_KEYS: Record<string, string> = {
  install: "extensionCenter.diagnostics.event.install",
  enable: "extensionCenter.diagnostics.event.enable",
  disable: "extensionCenter.diagnostics.event.disable",
  uninstall: "extensionCenter.diagnostics.event.uninstall",
  verify_fail: "extensionCenter.diagnostics.event.verifyFail",
  acl_deny: "extensionCenter.diagnostics.event.aclDeny",
  revoke_hit: "extensionCenter.diagnostics.event.revokeHit",
}

const RUNTIME_KIND_KEYS: Record<string, string> = {
  "window-error": "extensionCenter.diagnostics.kind.windowError",
  "unhandled-rejection": "extensionCenter.diagnostics.kind.unhandledRejection",
  "console.error": "extensionCenter.diagnostics.kind.consoleError",
  boot: "extensionCenter.diagnostics.kind.boot",
}

function DiagnosticsList({
  title,
  lines,
  emptyText,
  source,
}: {
  title: string
  lines: string[]
  emptyText: string
  source: DiagnosticSource
}) {
  const { t, i18n } = useTranslation()
  const [kindFilter, setKindFilter] = useState("all")
  const [query, setQuery] = useState("")
  const entries = useMemo(
    () => lines.map((line, index) => parseDiagnosticLine(line, source, index)).reverse(),
    [lines, source],
  )
  const kinds = useMemo(
    () => [...new Set(entries.map((entry) => entry.kind).filter((kind): kind is string => !!kind))],
    [entries],
  )
  const filteredEntries = useMemo(
    () => filterDiagnosticEntries(entries, kindFilter, query),
    [entries, kindFilter, query],
  )

  const getKindLabel = (kind: string | null) => {
    if (!kind) return t("extensionCenter.diagnostics.unknown")
    const key = source === "audit" ? AUDIT_EVENT_KEYS[kind] : RUNTIME_KIND_KEYS[kind]
    return key ? t(key) : kind
  }

  const isFailure = (entry: DiagnosticEntry) =>
    source === "audit"
      ? ["verify_fail", "acl_deny", "revoke_hit"].includes(entry.kind ?? "")
      : ["window-error", "unhandled-rejection", "console.error"].includes(entry.kind ?? "")

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return t("extensionCenter.diagnostics.timeUnavailable")
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime())
      ? timestamp
      : date.toLocaleString(i18n.resolvedLanguage, {
          dateStyle: "medium",
          timeStyle: "short",
        })
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-muted-foreground text-xs" aria-live="polite">
          {t("extensionCenter.diagnostics.count", {
            visible: filteredEntries.length,
            total: entries.length,
          })}
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="text-muted-foreground rounded border border-dashed p-4 text-xs">
          {emptyText}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label={t("extensionCenter.diagnostics.searchLabel")}
              className="h-8 min-w-48 flex-1 text-xs"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("extensionCenter.diagnostics.searchPlaceholder")}
              value={query}
            />
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger
                aria-label={t("extensionCenter.diagnostics.filterLabel")}
                className="h-8 w-48 text-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("extensionCenter.diagnostics.filterAll")}</SelectItem>
                {kinds.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {getKindLabel(kind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filteredEntries.length === 0 ? (
            <p className="text-muted-foreground rounded border border-dashed p-4 text-xs">
              {t("extensionCenter.diagnostics.noMatches")}
            </p>
          ) : (
            <div className="bg-muted/20 max-h-[32rem] overflow-auto rounded border">
              <ol className="divide-y">
                {filteredEntries.map((entry) => (
                  <li key={entry.id} className="min-w-0 space-y-1.5 p-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 text-xs font-medium",
                          isFailure(entry)
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-border bg-background text-muted-foreground",
                        )}
                      >
                        {getKindLabel(entry.kind)}
                      </span>
                      {entry.extensionId && (
                        <code className="text-xs font-medium">{entry.extensionId}</code>
                      )}
                      {entry.version && (
                        <span className="text-muted-foreground text-xs">v{entry.version}</span>
                      )}
                      <time
                        className="text-muted-foreground ml-auto text-xs"
                        dateTime={entry.timestamp ?? undefined}
                        title={entry.timestamp ?? undefined}
                      >
                        {formatTimestamp(entry.timestamp)}
                      </time>
                    </div>
                    <p className="min-w-0 text-sm break-words">{entry.detail}</p>
                    {entry.location && (
                      <p className="text-muted-foreground min-w-0 text-xs break-all">
                        {entry.location}
                      </p>
                    )}
                    {entry.raw.startsWith("{") && (
                      <details className="text-muted-foreground text-xs">
                        <summary className="w-fit cursor-pointer">
                          {t("extensionCenter.diagnostics.rawDetails")}
                        </summary>
                        <pre className="mt-1 max-h-32 overflow-auto break-all whitespace-pre-wrap">
                          {entry.raw}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** P4 诊断面板：插件审计日志 + 运行时错误（JSONL 尾部），替代裸 JSON 文件。 */
export function DiagnosticsPanel() {
  const { t } = useTranslation()
  const [data, setData] = useState<ExtensionDiagnostics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<AppErrorShape | null>(null)
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const currentRequestId = ++requestId.current
    setLoading(true)
    setError(null)
    try {
      const nextData = await getExtensionDiagnostics()
      if (requestId.current === currentRequestId) setData(nextData)
    } catch (rawError) {
      if (requestId.current === currentRequestId) setError(parseCommandError(rawError))
    } finally {
      if (requestId.current === currentRequestId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return () => {
      requestId.current += 1
    }
  }, [refresh])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">{t("extensionCenter.diagnostics.hint")}</p>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? t("extensionCenter.diagnostics.refreshing") : t("extensionCenter.refresh")}
        </Button>
      </div>
      {error && !data ? (
        <div
          className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          <p className="font-mono text-xs">
            [{error.code}] {error.message}
          </p>
        </div>
      ) : data ? (
        <>
          {error && (
            <div
              className="border-destructive/30 bg-destructive/10 text-destructive rounded border p-3 text-sm"
              role="alert"
            >
              <p className="font-mono text-xs">
                [{error.code}] {error.message}
              </p>
            </div>
          )}
          <DiagnosticsList
            title={t("extensionCenter.diagnostics.audit")}
            lines={data.audit}
            emptyText={t("extensionCenter.diagnostics.empty")}
            source="audit"
          />
          <DiagnosticsList
            title={t("extensionCenter.diagnostics.runtime")}
            lines={data.runtime}
            emptyText={t("extensionCenter.diagnostics.empty")}
            source="runtime"
          />
        </>
      ) : (
        <div className="space-y-3" role="status">
          <span className="sr-only">{t("extensionCenter.loading")}</span>
          <div className="bg-muted h-10 animate-pulse rounded" />
          <div className="bg-muted h-24 animate-pulse rounded" />
          <div className="bg-muted h-10 animate-pulse rounded" />
          <div className="bg-muted h-24 animate-pulse rounded" />
        </div>
      )}
    </div>
  )
}

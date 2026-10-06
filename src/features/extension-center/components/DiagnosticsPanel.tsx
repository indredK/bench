import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { getExtensionDiagnostics } from "@/lib/tauri/commands/extension-center"
import type { ExtensionDiagnostics } from "@/lib/tauri/types/extension-center"
import { parseCommandError } from "@/lib/tauri/errors"
import type { AppErrorShape } from "@/lib/tauri/errors"

import {
  categorizeRuntimeDiagnostics,
  countRuntimeDiagnostics,
  filterRuntimeDiagnostics,
  type RuntimeDiagnosticFilter,
} from "../lib/diagnostics"

const EMPTY_LINES: string[] = []

const FILTERS = [
  { value: "all", label: "extensionCenter.diagnostics.filters.all" },
  { value: "window-error", label: "extensionCenter.diagnostics.filters.windowError" },
  {
    value: "unhandled-rejection",
    label: "extensionCenter.diagnostics.filters.unhandledRejection",
  },
  { value: "console.error", label: "extensionCenter.diagnostics.filters.consoleError" },
  { value: "boot", label: "extensionCenter.diagnostics.filters.boot" },
  { value: "other", label: "extensionCenter.diagnostics.filters.other" },
] as const satisfies ReadonlyArray<{ value: RuntimeDiagnosticFilter; label: string }>

function DiagnosticsList({
  title,
  lines,
  emptyText,
}: {
  title: string | null
  lines: string[]
  emptyText: string
}) {
  return (
    <section>
      {title && <h3 className="mb-2 text-sm font-medium">{title}</h3>}
      {lines.length === 0 ? (
        <p className="text-muted-foreground rounded border border-dashed p-4 text-xs">
          {emptyText}
        </p>
      ) : (
        <div className="bg-muted/30 max-h-64 overflow-auto rounded border p-2">
          {lines.map((line, index) => (
            <pre
              key={index}
              className="font-mono text-[11px] leading-5 break-all whitespace-pre-wrap"
            >
              {line}
            </pre>
          ))}
        </div>
      )}
    </section>
  )
}

function DiagnosticsLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-4">
      <div aria-hidden="true" className="flex flex-col gap-4">
        {[0, 1].map((section) => (
          <section key={section} className="flex flex-col gap-2">
            <div className="bg-muted h-4 w-36 rounded motion-safe:animate-pulse" />
            <div className="bg-muted/30 flex max-h-64 flex-col gap-2 overflow-hidden rounded border p-3">
              {[0, 1, 2].map((line) => (
                <div
                  key={line}
                  className="bg-muted h-3 rounded motion-safe:animate-pulse"
                  style={{ width: `${92 - line * 17}%` }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

/** P4 诊断面板：插件审计日志 + 运行时错误（JSONL 尾部），替代裸 JSON 文件。 */
export function DiagnosticsPanel() {
  const { t } = useTranslation()
  const [data, setData] = useState<ExtensionDiagnostics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppErrorShape | null>(null)
  const [filter, setFilter] = useState<RuntimeDiagnosticFilter>("all")

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getExtensionDiagnostics())
    } catch (rawError) {
      setError(parseCommandError(rawError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const runtimeLines = data?.runtime ?? EMPTY_LINES
  const categorizedRuntime = useMemo(
    () => categorizeRuntimeDiagnostics(runtimeLines),
    [runtimeLines],
  )
  const runtimeCounts = useMemo(
    () => countRuntimeDiagnostics(categorizedRuntime),
    [categorizedRuntime],
  )
  const visibleRuntime = useMemo(
    () => filterRuntimeDiagnostics(categorizedRuntime, filter).map((record) => record.line),
    [categorizedRuntime, filter],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">{t("extensionCenter.diagnostics.hint")}</p>
        <div className="flex shrink-0 items-center gap-2">
          {loading && data && (
            <span role="status" className="text-muted-foreground text-xs">
              {t("extensionCenter.diagnostics.refreshing")}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            {t("extensionCenter.refresh")}
          </Button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">
                {t(
                  data
                    ? "extensionCenter.diagnostics.refreshFailed"
                    : "extensionCenter.diagnostics.loadFailed",
                )}
              </p>
              <p className="font-mono text-xs break-all">
                [{error.code}] {error.message}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              {t("extensionCenter.retry")}
            </Button>
          </div>
        </div>
      )}
      {data ? (
        <div aria-busy={loading} className="flex flex-col gap-4">
          <DiagnosticsList
            title={t("extensionCenter.diagnostics.audit")}
            lines={data.audit}
            emptyText={t("extensionCenter.diagnostics.empty")}
          />
          <section>
            <h3 className="mb-2 text-sm font-medium">{t("extensionCenter.diagnostics.runtime")}</h3>
            <div
              role="group"
              aria-label={t("extensionCenter.diagnostics.filterLabel")}
              className="mb-2 flex flex-wrap gap-1"
            >
              {FILTERS.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  size="xs"
                  variant={filter === value ? "secondary" : "outline"}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {t(label)} ({runtimeCounts[value]})
                </Button>
              ))}
            </div>
            <DiagnosticsList
              title={null}
              lines={visibleRuntime}
              emptyText={t(
                filter === "all"
                  ? "extensionCenter.diagnostics.empty"
                  : "extensionCenter.diagnostics.filteredEmpty",
              )}
            />
          </section>
        </div>
      ) : loading ? (
        <DiagnosticsLoading label={t("extensionCenter.diagnostics.loading")} />
      ) : null}
    </div>
  )
}

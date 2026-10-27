/**
 * Feature UI / 功能界面: health report export (JSON / Markdown).
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { ReportHistoryComparison } from "@/features/network-probe/components/ReportHistoryComparison"
import type { HealthReportSnapshot } from "@/features/network-probe/report-history"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

interface ReportPanelProps {
  health: HealthScanResult | null
  history: HealthReportSnapshot[]
  commandLog: string[]
  onClearLog: () => void
  onClearHistory: () => void
  onGoTree: () => void
  embedded?: boolean
}

function toMarkdown(
  result: HealthScanResult,
  tTitle: string,
  exportedAt: string,
  savedAt?: string,
): string {
  const lines: string[] = [
    `# ${tTitle}`,
    "",
    `- sessionId: \`${result.sessionId}\``,
    `- exportedAt: ${exportedAt}`,
    ...(savedAt ? [`- savedAt: ${savedAt}`] : []),
    `- elapsedMs: ${result.elapsedMs.toFixed(0)}`,
    `- cancelled: ${result.cancelled}`,
    `- commandHint: \`${result.commandHint}\``,
    "",
    "## Checks",
    "",
  ]
  for (const item of result.items) {
    lines.push(
      `- **${item.key}** [${item.layer}/${item.status}]${item.detail ? ` — ${item.detail}` : ""}`,
    )
    if (item.commandHint) lines.push(`  - \`${item.commandHint}\``)
  }
  lines.push("", "## Opinions", "")
  if (result.opinions.length === 0) {
    lines.push("- (none)")
  } else {
    for (const op of result.opinions) {
      lines.push(`- **${op.id}** (${op.severity}) — ${op.titleKey}`)
    }
  }
  lines.push("")
  return lines.join("\n")
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ReportPanel({
  health,
  history,
  commandLog,
  onClearLog,
  onClearHistory,
  onGoTree,
  embedded = false,
}: ReportPanelProps) {
  const { t, i18n } = useTranslation()
  const [confirmClearHistory, setConfirmClearHistory] = useState(false)
  const [confirmClearLog, setConfirmClearLog] = useState(false)
  const stamp = useMemo(() => new Date().toISOString().replace(/[:.]/g, "-"), [health])
  const locale = i18n?.resolvedLanguage || i18n?.language || "en"

  function formatSnapshotDate(savedAt: string | undefined) {
    if (!savedAt || !Number.isFinite(Date.parse(savedAt))) {
      return t("networkProbe.report.timeUnavailable")
    }

    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(savedAt),
      )
    } catch {
      return t("networkProbe.report.timeUnavailable")
    }
  }

  function downloadCurrentReport(format: "json" | "md") {
    if (!health) return
    const exportedAt = new Date().toISOString()
    const savedAt = history.find((snapshot) => snapshot.sessionId === health.sessionId)?.savedAt

    if (format === "json") {
      downloadBlob(
        `network-probe-health-${stamp}.json`,
        JSON.stringify({ ...health, ...(savedAt ? { savedAt } : {}), exportedAt }, null, 2),
        "application/json",
      )
      return
    }

    downloadBlob(
      `network-probe-health-${stamp}.md`,
      toMarkdown(health, t("networkProbe.report.title"), exportedAt, savedAt),
      "text/markdown",
    )
  }

  return (
    <ProbePanelShell
      embedded={embedded}
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.report.hint")}</p>

          {!health ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">{t("networkProbe.report.empty")}</p>
              <Button type="button" variant="outline" onClick={onGoTree}>
                {t("networkProbe.report.goTree")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-muted-foreground text-xs">
                {t("networkProbe.report.meta", {
                  ms: health.elapsedMs.toFixed(0),
                  count: health.items.length,
                  cancelled: health.cancelled
                    ? t("networkProbe.report.cancelledYes")
                    : t("networkProbe.report.cancelledNo"),
                })}
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("networkProbe.report.privacyHint")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => downloadCurrentReport("json")}>
                  {t("networkProbe.report.exportJson")}
                </Button>
                <Button type="button" variant="outline" onClick={() => downloadCurrentReport("md")}>
                  {t("networkProbe.report.exportMd")}
                </Button>
              </div>
            </div>
          )}
        </>
      }
    >
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.report.historyTitle")}
          </h3>
          {history.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmClearHistory(true)}
            >
              {t("networkProbe.report.clearHistory")}
            </Button>
          ) : null}
        </div>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("networkProbe.report.historyEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {history.map((h, idx) => (
              <li key={`${h.sessionId}-${idx}`} className="bg-muted/30 rounded border px-2 py-1">
                <time
                  className="text-muted-foreground mr-2"
                  dateTime={
                    h.savedAt && Number.isFinite(Date.parse(h.savedAt)) ? h.savedAt : undefined
                  }
                >
                  {formatSnapshotDate(h.savedAt)}
                </time>
                <span aria-hidden="true"> · </span>
                {t("networkProbe.report.historyItem", {
                  session: h.sessionId.slice(0, 8),
                  count: h.items.length,
                  ms: h.elapsedMs.toFixed(0),
                  opinionCount: t("networkProbe.report.opinionCount", {
                    count: h.opinions.length,
                  }),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 ? <ReportHistoryComparison history={history} /> : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.report.logTitle")}
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={commandLog.length === 0}
            onClick={() => setConfirmClearLog(true)}
          >
            {t("networkProbe.report.clearLog")}
          </Button>
        </div>
        <p className="text-muted-foreground hidden text-[11px] lg:block">
          {t("networkProbe.report.logSideHint")}
        </p>
        {commandLog.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("networkProbe.report.logEmpty")}</p>
        ) : (
          <ul className="bg-muted/30 rounded-md border p-2 font-mono text-[11px]">
            {commandLog.map((line, idx) => (
              <li key={`${idx}-${line}`} className="text-muted-foreground truncate" title={line}>
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>

      <DestructiveConfirmDialog
        open={confirmClearHistory}
        onOpenChange={setConfirmClearHistory}
        title={t("networkProbe.report.clearHistoryConfirmTitle")}
        description={t("networkProbe.report.clearHistoryConfirmDescription")}
        confirmLabel={t("networkProbe.report.clearHistory")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          onClearHistory()
          setConfirmClearHistory(false)
        }}
      />

      <DestructiveConfirmDialog
        open={confirmClearLog}
        onOpenChange={setConfirmClearLog}
        title={t("networkProbe.sideLog.clearConfirmTitle")}
        description={t("networkProbe.sideLog.clearConfirmDescription")}
        confirmLabel={t("networkProbe.report.clearLog")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          onClearLog()
          setConfirmClearLog(false)
        }}
      />
    </ProbePanelShell>
  )
}

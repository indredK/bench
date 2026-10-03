/**
 * Feature UI / 功能界面: health report export (JSON / Markdown).
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { HealthReportSnapshot } from "@/features/network-probe/report-history"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

interface ReportPanelProps {
  health: HealthScanResult | null
  history: HealthReportSnapshot[]
  commandLog: string[]
  onClearLog: () => void
  onClearHistory: () => void
  onGoTree: () => void
}

function toMarkdown(result: HealthScanResult, tTitle: string): string {
  const lines: string[] = [
    `# ${tTitle}`,
    "",
    `- sessionId: \`${result.sessionId}\``,
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

interface HealthStatusChange {
  key: string
  previousStatus: string | null
  currentStatus: string | null
}

function compareStatuses(
  previous: HealthScanResult,
  current: HealthScanResult,
): HealthStatusChange[] {
  const previousByKey = new Map(previous.items.map((item) => [item.key, item.status]))
  const currentByKey = new Map(current.items.map((item) => [item.key, item.status]))
  const keys = new Set([...previousByKey.keys(), ...currentByKey.keys()])

  return [...keys]
    .map((key) => ({
      key,
      previousStatus: previousByKey.get(key) ?? null,
      currentStatus: currentByKey.get(key) ?? null,
    }))
    .filter((change) => change.previousStatus !== change.currentStatus)
}

export function ReportPanel({
  health,
  history,
  commandLog,
  onClearLog,
  onClearHistory,
  onGoTree,
}: ReportPanelProps) {
  const { t, i18n } = useTranslation()
  const [baselineSessionId, setBaselineSessionId] = useState("")
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false)
  const stamp = useMemo(() => new Date().toISOString().replace(/[:.]/g, "-"), [health])
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [i18n.language, i18n.resolvedLanguage],
  )
  const currentSnapshot = history[0] ?? null
  const olderSnapshots = history.slice(1)
  const baselineSnapshot =
    olderSnapshots.find((snapshot) => snapshot.result.sessionId === baselineSessionId) ??
    olderSnapshots[0] ??
    null
  const statusChanges = useMemo(
    () =>
      baselineSnapshot && currentSnapshot
        ? compareStatuses(baselineSnapshot.result, currentSnapshot.result)
        : [],
    [baselineSnapshot, currentSnapshot],
  )
  const formatCapturedAt = (snapshot: HealthReportSnapshot) =>
    snapshot.capturedAt
      ? dateFormatter.format(new Date(snapshot.capturedAt))
      : t("networkProbe.report.timeUnknown")
  const formatSnapshotLabel = (snapshot: HealthReportSnapshot) =>
    `${formatCapturedAt(snapshot)} · ${snapshot.result.sessionId.slice(0, 8)}`
  const translateStatus = (status: string | null) =>
    status === null
      ? t("networkProbe.report.notPresent")
      : t(`networkProbe.health.status.${status}`, { defaultValue: status })

  return (
    <ProbePanelShell
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
                <Button
                  type="button"
                  onClick={() =>
                    downloadBlob(
                      `network-probe-health-${stamp}.json`,
                      JSON.stringify(health, null, 2),
                      "application/json",
                    )
                  }
                >
                  {t("networkProbe.report.exportJson")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    downloadBlob(
                      `network-probe-health-${stamp}.md`,
                      toMarkdown(health, t("networkProbe.report.title")),
                      "text/markdown",
                    )
                  }
                >
                  {t("networkProbe.report.exportMd")}
                </Button>
              </div>
              <p className="text-muted-foreground font-mono text-xs">{health.commandHint}</p>
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
              onClick={() => setClearHistoryOpen(true)}
            >
              {t("networkProbe.report.clearHistory")}
            </Button>
          ) : null}
        </div>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("networkProbe.report.historyEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {history.map((snapshot, idx) => (
              <li
                key={`${snapshot.result.sessionId}-${idx}`}
                className="bg-muted/30 rounded border px-2 py-1"
              >
                <span className="text-muted-foreground block">{formatSnapshotLabel(snapshot)}</span>
                {t("networkProbe.report.historyItem", {
                  session: snapshot.result.sessionId.slice(0, 8),
                  count: snapshot.result.items.length,
                  ms: snapshot.result.elapsedMs.toFixed(0),
                  opinions: snapshot.result.opinions.length,
                })}
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 ? (
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.report.historyPrivacyHint")}
          </p>
        ) : null}
        {currentSnapshot && baselineSnapshot ? (
          <div className="space-y-2 rounded-md border p-2">
            <label className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium">{t("networkProbe.report.compareWith")}</span>
              <select
                className="border-input bg-background rounded-md border px-2 py-1"
                aria-label={t("networkProbe.report.compareWith")}
                value={baselineSnapshot.result.sessionId}
                onChange={(event) => setBaselineSessionId(event.target.value)}
              >
                {olderSnapshots.map((snapshot) => (
                  <option key={snapshot.result.sessionId} value={snapshot.result.sessionId}>
                    {formatSnapshotLabel(snapshot)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-muted-foreground text-xs">
              {t("networkProbe.report.comparingSnapshots", {
                previous: formatSnapshotLabel(baselineSnapshot),
                current: formatSnapshotLabel(currentSnapshot),
                count: statusChanges.length,
              })}
            </p>
            <p className="text-muted-foreground text-xs">
              {t("networkProbe.report.compareStatusOnly")}
            </p>
            {statusChanges.length === 0 ? (
              <p className="text-xs" role="status">
                {t("networkProbe.report.noStatusChanges")}
              </p>
            ) : (
              <ul className="space-y-1 text-xs" aria-label={t("networkProbe.report.changesLabel")}>
                {statusChanges.map((change) => (
                  <li
                    key={change.key}
                    className="bg-muted/30 flex flex-wrap gap-2 rounded px-2 py-1"
                  >
                    <span className="font-medium">{change.key}</span>
                    <span>{translateStatus(change.previousStatus)}</span>
                    <span aria-hidden="true">→</span>
                    <span>{translateStatus(change.currentStatus)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : history.length > 0 ? (
          <p className="text-muted-foreground text-xs" role="status">
            {t("networkProbe.report.needTwoSnapshots")}
          </p>
        ) : null}
        <DestructiveConfirmDialog
          open={clearHistoryOpen}
          onOpenChange={setClearHistoryOpen}
          title={t("networkProbe.report.clearHistoryTitle")}
          description={t("networkProbe.report.clearHistoryDescription")}
          consequence={t("networkProbe.report.clearHistoryConsequence")}
          confirmLabel={t("networkProbe.report.clearHistoryConfirm")}
          cancelLabel={t("networkProbe.report.cancel")}
          onConfirm={onClearHistory}
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.report.logTitle")}
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={onClearLog}>
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
    </ProbePanelShell>
  )
}

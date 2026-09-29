/** Feature UI / 功能界面: health report export and command log. */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { ReportHistorySection } from "@/features/network-probe/components/ReportHistorySection"
import type { HealthReportSnapshot } from "@/features/network-probe/report-history"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

interface ReportPanelProps {
  health: HealthScanResult | null
  history: HealthReportSnapshot[]
  historyEnabled: boolean
  commandLog: string[]
  onClearLog: () => void
  onClearHistory: () => void
  onSetHistoryEnabled: (enabled: boolean) => void
  onGoTree: () => void
}

function toMarkdown(
  result: HealthScanResult,
  labels: { title: string; checks: string; opinions: string; none: string },
): string {
  const lines: string[] = [
    `# ${labels.title}`,
    "",
    `- sessionId: \`${result.sessionId}\``,
    `- elapsedMs: ${result.elapsedMs.toFixed(0)}`,
    `- cancelled: ${result.cancelled}`,
    `- commandHint: \`${result.commandHint}\``,
    "",
    `## ${labels.checks}`,
    "",
  ]
  for (const item of result.items) {
    lines.push(
      `- **${item.key}** [${item.layer}/${item.status}]${item.detail ? ` — ${item.detail}` : ""}`,
    )
    if (item.commandHint) lines.push(`  - \`${item.commandHint}\``)
  }
  lines.push("", `## ${labels.opinions}`, "")
  if (result.opinions.length === 0) {
    lines.push(`- ${labels.none}`)
  } else {
    for (const opinion of result.opinions) {
      lines.push(`- **${opinion.id}** (${opinion.severity}) — ${opinion.titleKey}`)
    }
  }
  lines.push("")
  return lines.join("\n")
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ReportPanel({
  health,
  history,
  historyEnabled,
  commandLog,
  onClearLog,
  onClearHistory,
  onSetHistoryEnabled,
  onGoTree,
}: ReportPanelProps) {
  const { t } = useTranslation()
  const stamp = useMemo(() => new Date().toISOString().replace(/[:.]/g, "-"), [health])
  const [confirmClearLog, setConfirmClearLog] = useState(false)
  const tMarkdown = (key: string) => t(`networkProbe.report.markdown.${key}`)

  return (
    <>
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
                        toMarkdown(health, {
                          title: t("networkProbe.report.title"),
                          checks: tMarkdown("checks"),
                          opinions: tMarkdown("opinions"),
                          none: tMarkdown("none"),
                        }),
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
        <ReportHistorySection
          history={history}
          enabled={historyEnabled}
          onClear={onClearHistory}
          onSetEnabled={onSetHistoryEnabled}
        />

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wide uppercase">
              {t("networkProbe.report.logTitle")}
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
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
              {commandLog.map((line, index) => (
                <li
                  key={`${index}-${line}`}
                  className="text-muted-foreground truncate"
                  title={line}
                >
                  {line}
                </li>
              ))}
            </ul>
          )}
        </section>
      </ProbePanelShell>

      <DestructiveConfirmDialog
        open={confirmClearLog}
        onOpenChange={setConfirmClearLog}
        title={t("networkProbe.sideLog.clearConfirmTitle")}
        description={t("networkProbe.sideLog.clearConfirmDescription")}
        confirmLabel={t("networkProbe.sideLog.clear")}
        cancelLabel={t("common.cancel")}
        onConfirm={onClearLog}
      />
    </>
  )
}

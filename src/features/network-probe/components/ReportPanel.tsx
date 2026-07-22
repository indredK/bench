/**
 * Feature UI / 功能界面: health report export (JSON / Markdown).
 */
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

interface ReportPanelProps {
  health: HealthScanResult | null
  history: HealthScanResult[]
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

export function ReportPanel({
  health,
  history,
  commandLog,
  onClearLog,
  onClearHistory,
  onGoTree,
}: ReportPanelProps) {
  const { t } = useTranslation()
  const stamp = useMemo(() => new Date().toISOString().replace(/[:.]/g, "-"), [health])

  return (
    <div className="space-y-4">
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

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.report.historyTitle")}
          </h3>
          {history.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClearHistory}>
              {t("networkProbe.report.clearHistory")}
            </Button>
          ) : null}
        </div>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("networkProbe.report.historyEmpty")}</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-auto text-xs">
            {history.map((h, idx) => (
              <li key={`${h.sessionId}-${idx}`} className="bg-muted/30 rounded border px-2 py-1">
                {t("networkProbe.report.historyItem", {
                  session: h.sessionId.slice(0, 8),
                  count: h.items.length,
                  ms: h.elapsedMs.toFixed(0),
                  opinions: h.opinions.length,
                })}
              </li>
            ))}
          </ul>
        )}
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
        {commandLog.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("networkProbe.report.logEmpty")}</p>
        ) : (
          <ul className="bg-muted/30 max-h-56 overflow-auto rounded-md border p-2 font-mono text-[11px]">
            {commandLog.map((line, idx) => (
              <li key={`${idx}-${line}`} className="text-muted-foreground truncate">
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

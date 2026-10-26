import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  compareHealthCheckStatuses,
  type HealthReportSnapshot,
} from "@/features/network-probe/report-history"

interface ReportHistoryComparisonProps {
  history: HealthReportSnapshot[]
}

function formatSnapshotDate(
  savedAt: string | undefined,
  locale: string,
  t: (key: string) => string,
) {
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

export function ReportHistoryComparison({ history }: ReportHistoryComparisonProps) {
  const { t, i18n } = useTranslation()
  const [baselineId, setBaselineId] = useState<string>()
  const [comparisonId, setComparisonId] = useState<string>()
  const locale = i18n?.resolvedLanguage || i18n?.language || "en"

  const comparison = history.find((entry) => entry.sessionId === comparisonId) ?? history[0]
  const preferredBaselineId = baselineId ?? history[1]?.sessionId
  const baseline =
    history.find(
      (entry) =>
        entry.sessionId === preferredBaselineId && entry.sessionId !== comparison?.sessionId,
    ) ?? history.find((entry) => entry.sessionId !== comparison?.sessionId)
  const changes = baseline && comparison ? compareHealthCheckStatuses(baseline, comparison) : []

  function optionLabel(snapshot: HealthReportSnapshot) {
    return `${formatSnapshotDate(snapshot.savedAt, locale, t)} · ${t(
      "networkProbe.report.historyItem",
      {
        session: snapshot.sessionId.slice(0, 8),
        count: snapshot.items.length,
        ms: snapshot.elapsedMs.toFixed(0),
        opinionCount: t("networkProbe.report.opinionCount", {
          count: snapshot.opinions.length,
        }),
      },
    )}`
  }

  return (
    <section className="space-y-2" aria-labelledby="network-probe-report-compare-title">
      <h3
        id="network-probe-report-compare-title"
        className="text-xs font-semibold tracking-wide uppercase"
      >
        {t("networkProbe.report.compareTitle")}
      </h3>
      <p className="text-muted-foreground text-xs">{t("networkProbe.report.compareHint")}</p>

      {history.length < 2 || !baseline || !comparison ? (
        <p role="status" className="text-muted-foreground text-xs">
          {t("networkProbe.report.compareNeedsTwo")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <label
                className="text-muted-foreground text-xs font-medium"
                htmlFor="network-probe-report-baseline"
              >
                {t("networkProbe.report.baselineSnapshot")}
              </label>
              <Select value={baseline.sessionId} onValueChange={setBaselineId}>
                <SelectTrigger id="network-probe-report-baseline" className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {history.map((snapshot) => (
                    <SelectItem
                      key={snapshot.sessionId}
                      value={snapshot.sessionId}
                      disabled={snapshot.sessionId === comparison.sessionId}
                    >
                      {optionLabel(snapshot)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-1">
              <label
                className="text-muted-foreground text-xs font-medium"
                htmlFor="network-probe-report-comparison"
              >
                {t("networkProbe.report.comparisonSnapshot")}
              </label>
              <Select value={comparison.sessionId} onValueChange={setComparisonId}>
                <SelectTrigger id="network-probe-report-comparison" className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {history.map((snapshot) => (
                    <SelectItem
                      key={snapshot.sessionId}
                      value={snapshot.sessionId}
                      disabled={snapshot.sessionId === baseline.sessionId}
                    >
                      {optionLabel(snapshot)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p role="status" className="text-muted-foreground text-xs">
            {t("networkProbe.report.compareSummary", {
              checks: changes.length,
              beforeOpinions: baseline.opinions.length,
              afterOpinions: comparison.opinions.length,
            })}
          </p>

          {changes.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("networkProbe.report.noCheckChanges")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{t("networkProbe.report.checkColumn")}</TableHead>
                  <TableHead scope="col">{t("networkProbe.report.baselineColumn")}</TableHead>
                  <TableHead scope="col">{t("networkProbe.report.comparisonColumn")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map((change) => (
                  <TableRow key={change.key}>
                    <TableHead scope="row" className="font-mono text-xs">
                      {change.key}
                    </TableHead>
                    <TableCell>
                      <CheckStatus status={change.beforeStatus} />
                    </TableCell>
                    <TableCell>
                      <CheckStatus status={change.afterStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </section>
  )
}

function CheckStatus({ status }: { status?: string }) {
  const { t } = useTranslation()
  if (!status) return <span>{t("networkProbe.report.notRecorded")}</span>
  return <span>{t(`networkProbe.health.status.${status}`, { defaultValue: status })}</span>
}

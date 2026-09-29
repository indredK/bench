/** Feature UI / 功能界面: local health snapshot history and comparison. */
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { DestructiveConfirmDialog } from "@/components/common/DestructiveConfirmDialog"
import { Button } from "@/components/ui/button"
import {
  compareHealthReports,
  type HealthCheckChangeKind,
  type HealthReportSnapshot,
} from "@/features/network-probe/report-history"
import { cn } from "@/lib/utils"

interface ReportHistorySectionProps {
  history: HealthReportSnapshot[]
  enabled: boolean
  onClear: () => void
  onSetEnabled: (enabled: boolean) => void
}

function formatCapturedAt(capturedAt: number | null, locale: string): string | null {
  if (capturedAt === null || !Number.isFinite(new Date(capturedAt).getTime())) return null
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
    capturedAt,
  )
}

function snapshotLabel(
  snapshot: HealthReportSnapshot,
  locale: string,
  unknownTime: string,
): string {
  const date = formatCapturedAt(snapshot.capturedAt, locale) ?? unknownTime
  return `${date} · ${snapshot.result.sessionId.slice(0, 8)}… · ${snapshot.result.items.length}`
}

const CHANGE_KINDS: HealthCheckChangeKind[] = [
  "improved",
  "worsened",
  "changed",
  "added",
  "removed",
  "unchanged",
]

export function ReportHistorySection({
  history,
  enabled,
  onClear,
  onSetEnabled,
}: ReportHistorySectionProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "zh-CN"
  const [baselineId, setBaselineId] = useState(history[1]?.result.sessionId ?? "")
  const [comparedId, setComparedId] = useState(history[0]?.result.sessionId ?? "")
  const [selectionTouched, setSelectionTouched] = useState(false)
  const [showUnchanged, setShowUnchanged] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  useEffect(() => {
    if (history.length === 0) {
      setBaselineId("")
      setComparedId("")
      setSelectionTouched(false)
      return
    }
    if (!selectionTouched) {
      setBaselineId(history[1]?.result.sessionId ?? history[0].result.sessionId)
      setComparedId(history[0].result.sessionId)
      return
    }
    const ids = new Set(history.map((snapshot) => snapshot.result.sessionId))
    if (!ids.has(baselineId)) {
      setBaselineId(history[1]?.result.sessionId ?? history[0]?.result.sessionId ?? "")
    }
    if (!ids.has(comparedId)) setComparedId(history[0]?.result.sessionId ?? "")
  }, [history, baselineId, comparedId, selectionTouched])

  const baseline = history.find((snapshot) => snapshot.result.sessionId === baselineId)
  const compared = history.find((snapshot) => snapshot.result.sessionId === comparedId)
  const comparison = useMemo(() => {
    if (!baseline || !compared || baseline === compared) return null
    return compareHealthReports(baseline.result, compared.result)
  }, [baseline, compared])
  const visibleChanges = comparison?.checks.filter(
    (change) => showUnchanged || change.kind !== "unchanged",
  )
  const unknownTime = t("networkProbe.report.unknownTime")

  return (
    <>
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.report.historyTitle")}
          </h3>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                id="np-report-history-enabled"
                type="checkbox"
                checked={enabled}
                onChange={(event) => {
                  if (event.target.checked) onSetEnabled(true)
                  else if (history.length > 0) setConfirmDisable(true)
                  else onSetEnabled(false)
                }}
              />
              {t("networkProbe.report.saveHistory")}
            </label>
            {history.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
                {t("networkProbe.report.clearHistory")}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          {t("networkProbe.report.historyPrivacyHint")}
        </p>
        {!enabled ? (
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.report.historyDisabled")}
          </p>
        ) : history.length === 0 ? (
          <p className="text-muted-foreground text-xs">{t("networkProbe.report.historyEmpty")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {history.map((snapshot) => (
              <li
                key={snapshot.result.sessionId}
                className="bg-muted/30 flex flex-wrap items-center gap-x-2 rounded border px-2 py-1"
              >
                <time
                  className="text-muted-foreground"
                  dateTime={
                    snapshot.capturedAt === null ||
                    !Number.isFinite(new Date(snapshot.capturedAt).getTime())
                      ? undefined
                      : new Date(snapshot.capturedAt).toISOString()
                  }
                >
                  {formatCapturedAt(snapshot.capturedAt, locale) ?? unknownTime}
                </time>
                <span>
                  {t("networkProbe.report.historyItem", {
                    session: snapshot.result.sessionId.slice(0, 8),
                    count: snapshot.result.items.length,
                    ms: snapshot.result.elapsedMs.toFixed(0),
                    opinions: snapshot.result.opinions.length,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border p-3">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {t("networkProbe.report.compareTitle")}
          </h3>
          <p className="text-muted-foreground text-xs">{t("networkProbe.report.compareHint")}</p>
        </div>
        {!enabled ? (
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.report.compareDisabled")}
          </p>
        ) : history.length < 2 ? (
          <p className="text-muted-foreground text-xs">{t("networkProbe.report.compareNeedTwo")}</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium" htmlFor="np-report-baseline">
                  {t("networkProbe.report.compareBaseline")}
                </label>
                <select
                  id="np-report-baseline"
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={baselineId}
                  onChange={(event) => {
                    setSelectionTouched(true)
                    setBaselineId(event.target.value)
                  }}
                >
                  {history.map((snapshot) => (
                    <option
                      key={snapshot.result.sessionId}
                      value={snapshot.result.sessionId}
                      disabled={
                        snapshot.result.sessionId === comparedId &&
                        snapshot.result.sessionId !== baselineId
                      }
                    >
                      {snapshotLabel(snapshot, locale, unknownTime)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 space-y-1">
                <label className="text-xs font-medium" htmlFor="np-report-compared">
                  {t("networkProbe.report.compareAgainst")}
                </label>
                <select
                  id="np-report-compared"
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={comparedId}
                  onChange={(event) => {
                    setSelectionTouched(true)
                    setComparedId(event.target.value)
                  }}
                >
                  {history.map((snapshot) => (
                    <option
                      key={snapshot.result.sessionId}
                      value={snapshot.result.sessionId}
                      disabled={
                        snapshot.result.sessionId === baselineId &&
                        snapshot.result.sessionId !== comparedId
                      }
                    >
                      {snapshotLabel(snapshot, locale, unknownTime)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!comparison ? (
              <p className="text-muted-foreground text-xs">
                {t("networkProbe.report.compareChooseTwo")}
              </p>
            ) : (
              <div className="space-y-3">
                <dl className="flex flex-wrap gap-2">
                  {CHANGE_KINDS.filter((kind) => comparison.counts[kind] > 0).map((kind) => (
                    <div key={kind} className="bg-muted/50 rounded-md px-2 py-1 text-xs">
                      <dt className="text-muted-foreground inline">
                        {t(`networkProbe.report.change.${kind}`)}:
                      </dt>
                      <dd className="inline font-semibold">{comparison.counts[kind]}</dd>
                    </div>
                  ))}
                  <div className="bg-muted/50 rounded-md px-2 py-1 text-xs">
                    <dt className="text-muted-foreground inline">
                      {t("networkProbe.report.addedOpinions")}:
                    </dt>
                    <dd className="inline font-semibold">{comparison.addedOpinionCount}</dd>
                  </div>
                  <div className="bg-muted/50 rounded-md px-2 py-1 text-xs">
                    <dt className="text-muted-foreground inline">
                      {t("networkProbe.report.resolvedOpinions")}:
                    </dt>
                    <dd className="inline font-semibold">{comparison.resolvedOpinionCount}</dd>
                  </div>
                </dl>
                <label className="flex w-fit items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={showUnchanged}
                    onChange={(event) => setShowUnchanged(event.target.checked)}
                  />
                  {t("networkProbe.report.showUnchanged")}
                </label>
                {visibleChanges?.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("networkProbe.report.noChanges")}
                  </p>
                ) : (
                  <ul className="divide-border divide-y rounded-md border text-xs">
                    {visibleChanges?.map((change) => (
                      <li
                        key={change.key}
                        className="grid gap-1 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-3"
                      >
                        <span className="min-w-0 font-medium break-words">
                          {t(`networkProbe.health.checks.${change.key}`, {
                            defaultValue: change.key,
                          })}
                        </span>
                        <span className="text-muted-foreground">
                          {change.previousStatus
                            ? t(`networkProbe.health.status.${change.previousStatus}`, {
                                defaultValue: change.previousStatus,
                              })
                            : t("networkProbe.report.notPresent")}
                        </span>
                        <span aria-hidden="true" className="text-muted-foreground hidden sm:inline">
                          →
                        </span>
                        <span className="text-muted-foreground">
                          {change.currentStatus
                            ? t(`networkProbe.health.status.${change.currentStatus}`, {
                                defaultValue: change.currentStatus,
                              })
                            : t("networkProbe.report.notPresent")}
                          <span
                            className={cn(
                              "ml-2 font-medium",
                              change.kind === "improved" &&
                                "text-emerald-700 dark:text-emerald-400",
                              change.kind === "worsened" && "text-destructive",
                            )}
                          >
                            {t(`networkProbe.report.change.${change.kind}`)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>

      <DestructiveConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t("networkProbe.report.clearHistoryConfirmTitle")}
        description={t("networkProbe.report.clearHistoryConfirmDescription")}
        confirmLabel={t("networkProbe.report.clearHistory")}
        cancelLabel={t("common.cancel")}
        onConfirm={onClear}
      />
      <DestructiveConfirmDialog
        open={confirmDisable}
        onOpenChange={setConfirmDisable}
        title={t("networkProbe.report.disableHistoryConfirmTitle")}
        description={t("networkProbe.report.disableHistoryConfirmDescription")}
        confirmLabel={t("networkProbe.report.disableHistory")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => onSetEnabled(false)}
      />
    </>
  )
}

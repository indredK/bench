import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { HealthReportSnapshot } from "@/features/network-probe/report-history"
import { compareHealthChecks, compareHealthOpinions } from "@/features/network-probe/report-history"

interface ReportHistoryComparisonProps {
  history: HealthReportSnapshot[]
}

interface SnapshotSelection {
  beforeId: string
  afterId: string
}

function formatSnapshotDate(snapshot: HealthReportSnapshot, locale?: string): string | undefined {
  if (snapshot.savedAt === undefined) return undefined
  const date = new Date(snapshot.savedAt)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toLocaleString(locale)
}

export function ReportHistoryComparison({ history }: ReportHistoryComparisonProps) {
  const { t, i18n } = useTranslation()
  const [selection, setSelection] = useState<SnapshotSelection | null>(null)
  const [showUnchanged, setShowUnchanged] = useState(false)
  const defaultSelection = {
    beforeId: history[1]?.sessionId ?? history[0]?.sessionId ?? "",
    afterId: history[0]?.sessionId ?? "",
  }
  const selectionIsValid =
    selection !== null &&
    selection.beforeId !== selection.afterId &&
    history.some((snapshot) => snapshot.sessionId === selection.beforeId) &&
    history.some((snapshot) => snapshot.sessionId === selection.afterId)
  const activeSelection = selectionIsValid ? selection : defaultSelection
  const before = history.find((snapshot) => snapshot.sessionId === activeSelection.beforeId)
  const after = history.find((snapshot) => snapshot.sessionId === activeSelection.afterId)
  const checkChanges = useMemo(
    () => (before && after ? compareHealthChecks(before, after) : []),
    [before, after],
  )
  const opinionChanges = useMemo(
    () => (before && after ? compareHealthOpinions(before, after) : []),
    [before, after],
  )
  const visibleCheckChanges = showUnchanged
    ? checkChanges
    : checkChanges.filter((change) => change.kind !== "unchanged")
  const addedChecks = checkChanges.filter((change) => change.kind === "added").length
  const removedChecks = checkChanges.filter((change) => change.kind === "removed").length
  const changedChecks = checkChanges.filter((change) => change.kind === "changed").length
  const unchangedChecks = checkChanges.filter((change) => change.kind === "unchanged").length

  function selectBefore(beforeId: string) {
    const afterId =
      activeSelection.afterId === beforeId
        ? (history.find((snapshot) => snapshot.sessionId !== beforeId)?.sessionId ?? "")
        : activeSelection.afterId
    setSelection({ beforeId, afterId })
  }

  function selectAfter(afterId: string) {
    const beforeId =
      activeSelection.beforeId === afterId
        ? (history.find((snapshot) => snapshot.sessionId !== afterId)?.sessionId ?? "")
        : activeSelection.beforeId
    setSelection({ beforeId, afterId })
  }

  function optionLabel(snapshot: HealthReportSnapshot, index: number): string {
    const date =
      formatSnapshotDate(snapshot, i18n.resolvedLanguage ?? i18n.language) ??
      t("networkProbe.report.legacySnapshotDate")
    return t("networkProbe.report.historyOption", {
      rank: index + 1,
      session: snapshot.sessionId.slice(0, 8),
      count: snapshot.items.length,
      date,
    })
  }

  function formatCheck(snapshotItem: (typeof checkChanges)[number]["before"]) {
    if (!snapshotItem) return t("networkProbe.report.notInSnapshot")
    const status = t(`networkProbe.health.status.${snapshotItem.status}`, {
      defaultValue: snapshotItem.status,
    })
    const layer = t(`networkProbe.health.layers.${snapshotItem.layer}`, {
      defaultValue: snapshotItem.layer,
    })
    return (
      <>
        <span className="font-medium">
          {status} · {layer}
        </span>
        {snapshotItem.detail ? (
          <p className="text-muted-foreground mt-1 line-clamp-3 break-words whitespace-pre-wrap">
            {snapshotItem.detail}
          </p>
        ) : null}
      </>
    )
  }

  return (
    <section
      className="space-y-3 rounded-md border p-3"
      aria-labelledby="report-history-comparison-title"
    >
      <div className="space-y-1">
        <h4 id="report-history-comparison-title" className="text-sm font-semibold">
          {t("networkProbe.report.comparisonTitle")}
        </h4>
        <p className="text-muted-foreground text-xs">{t("networkProbe.report.comparisonHint")}</p>
      </div>

      {history.length < 2 ? (
        <p className="text-muted-foreground text-xs">
          {t("networkProbe.report.comparisonNeedTwo")}
        </p>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs" htmlFor="report-history-before">
              <span className="block font-medium">{t("networkProbe.report.snapshotA")}</span>
              <select
                id="report-history-before"
                className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-2 text-xs shadow-sm focus-visible:ring-2 focus-visible:outline-none"
                value={activeSelection.beforeId}
                onChange={(event) => selectBefore(event.currentTarget.value)}
              >
                {history.map((snapshot, index) => (
                  <option key={snapshot.sessionId} value={snapshot.sessionId}>
                    {optionLabel(snapshot, index)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs" htmlFor="report-history-after">
              <span className="block font-medium">{t("networkProbe.report.snapshotB")}</span>
              <select
                id="report-history-after"
                className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-2 text-xs shadow-sm focus-visible:ring-2 focus-visible:outline-none"
                value={activeSelection.afterId}
                onChange={(event) => selectAfter(event.currentTarget.value)}
              >
                {history.map((snapshot, index) => (
                  <option key={snapshot.sessionId} value={snapshot.sessionId}>
                    {optionLabel(snapshot, index)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {before && after ? (
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs" aria-live="polite">
                {t("networkProbe.report.comparisonSummary", {
                  added: addedChecks,
                  removed: removedChecks,
                  changed: changedChecks,
                  unchanged: unchangedChecks,
                  opinionsA: before.opinions.length,
                  opinionsB: after.opinions.length,
                  elapsedA: before.elapsedMs.toFixed(0),
                  elapsedB: after.elapsedMs.toFixed(0),
                })}
              </p>

              <label className="flex w-fit items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={showUnchanged}
                  onChange={(event) => setShowUnchanged(event.currentTarget.checked)}
                />
                {t("networkProbe.report.showUnchanged")}
              </label>

              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[36rem] text-left text-xs">
                  <caption className="sr-only">
                    {t("networkProbe.report.checkComparisonTable")}
                  </caption>
                  <thead className="bg-muted/50">
                    <tr>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t("networkProbe.report.checkColumn")}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t("networkProbe.report.snapshotA")}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t("networkProbe.report.snapshotB")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleCheckChanges.map((change) => (
                      <tr key={change.key}>
                        <th scope="row" className="min-w-28 px-2 py-2 align-top font-medium">
                          {change.key}
                          {change.kind !== "unchanged" ? (
                            <span className="text-muted-foreground mt-1 block font-normal">
                              {t(`networkProbe.report.change.${change.kind}`)}
                            </span>
                          ) : null}
                        </th>
                        <td className="max-w-64 px-2 py-2 align-top break-words">
                          {formatCheck(change.before)}
                        </td>
                        <td className="max-w-64 px-2 py-2 align-top break-words">
                          {formatCheck(change.after)}
                        </td>
                      </tr>
                    ))}
                    {visibleCheckChanges.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-muted-foreground px-2 py-3 text-center">
                          {t("networkProbe.report.noCheckChanges")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <section className="space-y-2" aria-labelledby="report-opinion-changes-title">
                <h5 id="report-opinion-changes-title" className="text-xs font-semibold">
                  {t("networkProbe.report.opinionChanges")}
                </h5>
                {opinionChanges.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("networkProbe.report.noOpinionChanges")}
                  </p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {opinionChanges.map((change) => (
                      <li key={change.id} className="bg-muted/30 rounded border px-2 py-2">
                        <span className="font-medium">{change.before?.id ?? change.after?.id}</span>
                        <span className="text-muted-foreground ml-2">
                          {t(`networkProbe.report.change.${change.kind}`)}
                        </span>
                        <div className="mt-1 grid gap-1 sm:grid-cols-2">
                          {[change.before, change.after].map((opinion, index) => (
                            <div key={index}>
                              <p className="font-medium">
                                {t(
                                  index === 0
                                    ? "networkProbe.report.snapshotA"
                                    : "networkProbe.report.snapshotB",
                                )}
                                :{" "}
                                {opinion
                                  ? `${t("networkProbe.opinion.severity." + opinion.severity)} · ${t(opinion.titleKey)}`
                                  : t("networkProbe.report.notInSnapshot")}
                              </p>
                              {opinion ? (
                                <>
                                  <p className="text-muted-foreground mt-1">{t(opinion.bodyKey)}</p>
                                  {opinion.relatedKeys.length > 0 ? (
                                    <p className="text-muted-foreground mt-1 break-words">
                                      {t("networkProbe.report.relatedChecks")}:{" "}
                                      {opinion.relatedKeys.join(", ")}
                                    </p>
                                  ) : null}
                                </>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

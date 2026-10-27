import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { compareHealthItems } from "@/features/network-probe/compare-health-snapshots"
import type { HealthScanResult } from "@/lib/tauri/types/network-probe"

interface ReportHistoryComparisonProps {
  history: HealthScanResult[]
  onGoTree: () => void
  embedded?: boolean
}

export function ReportHistoryComparison({
  history,
  onGoTree,
  embedded = false,
}: ReportHistoryComparisonProps) {
  const { t } = useTranslation()
  const Heading = embedded ? "h4" : "h3"
  const [comparisonAId, setComparisonAId] = useState<string | null>(null)
  const [comparisonBId, setComparisonBId] = useState<string | null>(null)
  const selectedAId = history.some((item) => item.sessionId === comparisonAId)
    ? comparisonAId
    : (history[0]?.sessionId ?? null)
  const defaultBId =
    history[1]?.sessionId !== selectedAId
      ? (history[1]?.sessionId ?? null)
      : (history.find((item) => item.sessionId !== selectedAId)?.sessionId ?? null)
  const selectedBId = history.some(
    (item) => item.sessionId === comparisonBId && item.sessionId !== selectedAId,
  )
    ? comparisonBId
    : defaultBId
  const selectedA = history.find((item) => item.sessionId === selectedAId)
  const selectedB = history.find((item) => item.sessionId === selectedBId)
  const comparison =
    selectedA && selectedB ? compareHealthItems(selectedA.items, selectedB.items) : []

  const selectors = [
    {
      id: "network-probe-report-snapshot-a",
      labelKey: "networkProbe.report.comparison.snapshotA",
      value: selectedAId ?? "",
      unavailableId: selectedBId,
      onChange: setComparisonAId,
    },
    {
      id: "network-probe-report-snapshot-b",
      labelKey: "networkProbe.report.comparison.snapshotB",
      value: selectedBId ?? "",
      unavailableId: selectedAId,
      onChange: setComparisonBId,
    },
  ] as const

  return (
    <section className="space-y-3" aria-labelledby="network-probe-report-comparison-title">
      <div className="space-y-1">
        <Heading
          id="network-probe-report-comparison-title"
          className="text-xs font-semibold tracking-wide uppercase"
        >
          {t("networkProbe.report.comparison.title")}
        </Heading>
        <p className="text-muted-foreground text-xs">{t("networkProbe.report.comparison.hint")}</p>
      </div>
      {history.length < 2 ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.report.comparison.needsTwoSnapshots")}
          </p>
          <Button type="button" variant="outline" onClick={onGoTree}>
            {t("networkProbe.report.goTree")}
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {selectors.map(({ id, labelKey, value, unavailableId, onChange }) => (
              <div key={id} className="space-y-1">
                <label htmlFor={id} className="text-muted-foreground text-xs">
                  {t(labelKey)}
                </label>
                <select
                  id={id}
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                  value={value}
                  onChange={(event) => onChange(event.target.value)}
                >
                  {history.map((item, index) => (
                    <option
                      key={`${item.sessionId}-${index}`}
                      value={item.sessionId}
                      disabled={item.sessionId === unavailableId}
                    >
                      {t("networkProbe.report.comparison.snapshotOption", {
                        position: index + 1,
                        session: item.sessionId.slice(0, 8),
                        count: item.items.length,
                      })}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {!selectedA || !selectedB ? null : comparison.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              {t("networkProbe.report.comparison.noChecks")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[32rem] text-left text-xs">
                <caption className="sr-only">
                  {t("networkProbe.report.comparison.tableCaption")}
                </caption>
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("networkProbe.report.comparison.check")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("networkProbe.report.comparison.snapshotA")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("networkProbe.report.comparison.snapshotB")}
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      {t("networkProbe.report.comparison.change")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {comparison.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="px-3 py-2 font-medium">
                        <span>
                          {t(`networkProbe.health.items.${row.key}.title`, {
                            defaultValue: row.key,
                          })}
                        </span>
                        <code className="text-muted-foreground mt-0.5 block font-mono text-[10px]">
                          {row.key}
                        </code>
                      </th>
                      <td className="px-3 py-2">
                        {row.statusA !== null
                          ? t(`networkProbe.health.status.${row.statusA}`, {
                              defaultValue: row.statusA,
                            })
                          : t("networkProbe.report.comparison.missing")}
                      </td>
                      <td className="px-3 py-2">
                        {row.statusB !== null
                          ? t(`networkProbe.health.status.${row.statusB}`, {
                              defaultValue: row.statusB,
                            })
                          : t("networkProbe.report.comparison.missing")}
                      </td>
                      <td className="px-3 py-2">
                        {t(`networkProbe.report.comparison.changeType.${row.change}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}

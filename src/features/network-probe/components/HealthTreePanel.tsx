/**
 * Feature UI / 功能界面: L0–L3 health tree for basic L1.
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { ScanCancelButton } from "@/features/network-probe/components/ScanCancelButton"
import { presentHealthCheckItem } from "@/features/network-probe/utils/health-check-presentation"
import type { HealthCheckItem, HealthScanResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

const LAYERS = ["L0", "L1", "L2", "L3"] as const

const HEALTH_STATUS_LABEL_KEYS = new Map<string, string>([
  ["pass", "networkProbe.health.status.pass"],
  ["warn", "networkProbe.health.status.warn"],
  ["fail", "networkProbe.health.status.fail"],
  ["skip", "networkProbe.health.status.skip"],
  ["error", "networkProbe.health.status.error"],
])

interface HealthTreePanelProps {
  loading: boolean
  result: HealthScanResult | null
  streamingItems: HealthCheckItem[]
  canCancel: boolean
  cancelRequested: boolean
  onRun: () => void
  onCancel: () => void
}

export function HealthTreePanel({
  loading,
  result,
  streamingItems,
  canCancel,
  cancelRequested,
  onRun,
  onCancel,
}: HealthTreePanelProps) {
  const { t } = useTranslation()
  // 跑动中只渲染本轮 streaming: 旧 result 优先会把上一轮结论当成新一轮进度。
  const items = loading ? streamingItems : result?.items?.length ? result.items : streamingItems

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.health.hint")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <CommandHint hint={t("networkProbe.cmd.healthScan")}>
              <Button type="button" disabled={loading} onClick={onRun}>
                {loading ? t("networkProbe.health.running") : t("networkProbe.health.run")}
              </Button>
            </CommandHint>
            {loading ? (
              <ScanCancelButton
                disabled={!canCancel}
                label={t("networkProbe.health.cancel")}
                cancelRequested={cancelRequested}
                onCancel={onCancel}
              />
            ) : null}
            {result ? (
              <span className="text-muted-foreground text-xs">
                {t("networkProbe.health.elapsed", { ms: result.elapsedMs.toFixed(0) })}
                {result.cancelled ? ` · ${t("networkProbe.health.cancelled")}` : ""}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground font-mono text-xs">
            {t("networkProbe.cmd.healthScan")}
          </p>
        </>
      }
    >
      {items.length === 0 && !loading ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.health.empty")}</p>
      ) : null}
      <div className="space-y-3">
        {LAYERS.map((layer) => {
          const layerItems = items.filter((i) => i.layer === layer)
          if (layerItems.length === 0) return null
          return (
            <section key={layer} className="space-y-1">
              <h3 className="text-xs font-semibold tracking-wide uppercase">
                {t(`networkProbe.health.layers.${layer}`)}
              </h3>
              <ul className="divide-border divide-y rounded-lg border text-sm">
                {layerItems.map((row) => (
                  <HealthCheckRow key={row.key} row={row} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </ProbePanelShell>
  )
}

function HealthCheckRow({ row }: { row: HealthCheckItem }) {
  const { t } = useTranslation()
  const presentation = presentHealthCheckItem(row)

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{t(presentation.labelKey)}</div>
        {presentation.detailKey ? (
          <div className="text-muted-foreground mt-0.5 text-xs">
            {t(presentation.detailKey, presentation.detailValues)}
          </div>
        ) : null}
        {presentation.technicalDetail || presentation.commandHint ? (
          <details className="text-muted-foreground mt-1 min-w-0 text-xs">
            <summary className="cursor-pointer select-none">
              {t("networkProbe.health.technicalDetails")}
            </summary>
            <div className="mt-1 font-mono text-[10px]">
              {t("networkProbe.health.checkKey", { key: presentation.checkKey })}
            </div>
            {presentation.technicalDetail ? (
              <pre className="bg-muted mt-1 max-w-full overflow-x-auto rounded px-2 py-1 font-mono text-[10px] break-all whitespace-pre-wrap">
                {presentation.technicalDetail}
              </pre>
            ) : null}
            {presentation.commandHint ? (
              <pre className="bg-muted text-muted-foreground mt-1 max-w-full overflow-x-auto rounded px-2 py-1 font-mono text-[10px] break-all whitespace-pre-wrap">
                {presentation.commandHint}
              </pre>
            ) : null}
          </details>
        ) : null}
      </div>
      <StatusBadge status={row.status} />
    </li>
  )
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  const statusLabelKey =
    HEALTH_STATUS_LABEL_KEYS.get(status) ?? "networkProbe.health.status.unknown"
  const isKnownStatus = HEALTH_STATUS_LABEL_KEYS.has(status)

  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
        !isKnownStatus && "bg-muted text-muted-foreground",
        status === "pass" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        status === "warn" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        status === "fail" && "bg-destructive/15 text-destructive",
        status === "error" && "bg-destructive/15 text-destructive",
        status === "skip" && "bg-muted text-muted-foreground",
      )}
    >
      {t(statusLabelKey)}
    </span>
  )
}

/**
 * Feature UI / 功能界面: L0–L3 health tree for basic L1.
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { HealthCheckItem, HealthScanResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

const LAYERS = ["L0", "L1", "L2", "L3"] as const

interface HealthTreePanelProps {
  loading: boolean
  result: HealthScanResult | null
  streamingItems: HealthCheckItem[]
  canCancel: boolean
  onRun: () => void
  onCancel: () => void
}

export function HealthTreePanel({
  loading,
  result,
  streamingItems,
  canCancel,
  onRun,
  onCancel,
}: HealthTreePanelProps) {
  const { t } = useTranslation()
  const items = result?.items?.length ? result.items : streamingItems

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
              <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
                <Button type="button" variant="outline" disabled={!canCancel} onClick={onCancel}>
                  {t("networkProbe.health.cancel")}
                </Button>
              </CommandHint>
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
                  <li
                    key={row.key}
                    className="flex flex-wrap items-start justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-medium">{row.key}</div>
                      {row.detail ? (
                        <div className="text-muted-foreground text-xs">{row.detail}</div>
                      ) : null}
                      {row.commandHint ? (
                        <div className="text-muted-foreground/80 font-mono text-[10px]">
                          {row.commandHint}
                        </div>
                      ) : null}
                    </div>
                    <StatusBadge status={row.status} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      {result?.commandHint ? (
        <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
      ) : null}
    </ProbePanelShell>
  )
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
        status === "pass" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
        status === "warn" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
        status === "fail" && "bg-destructive/15 text-destructive",
        status === "error" && "bg-destructive/15 text-destructive",
        status === "skip" && "bg-muted text-muted-foreground",
      )}
    >
      {t(`networkProbe.health.status.${status}`, { defaultValue: status })}
    </span>
  )
}

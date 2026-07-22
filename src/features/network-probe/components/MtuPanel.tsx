/**
 * Feature UI / 功能界面: path MTU / PMTUD panel (dual entry with Offline).
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { PathMtuResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

interface MtuPanelProps {
  loading: boolean
  result: PathMtuResult | null
  onRun: (target: string) => void
  dualFrom?: "offline" | "test"
}

export function MtuPanel({ loading, result, onRun, dualFrom }: MtuPanelProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState("1.1.1.1")

  return (
    <ProbePanelShell
      embedded={dualFrom === "offline"}
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.mtu.hint")}</p>
          {dualFrom ? (
            <p className="text-muted-foreground text-xs">
              {t(`networkProbe.dualEntry.from.${dualFrom}`)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-mtu-target">
                {t("networkProbe.mtu.target")}
              </label>
              <Input
                id="np-mtu-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={t("networkProbe.mtu.targetPlaceholder")}
                autoComplete="off"
              />
            </div>
            <Button
              type="button"
              disabled={loading || !target.trim()}
              onClick={() => onRun(target)}
            >
              {loading ? t("networkProbe.mtu.running") : t("networkProbe.mtu.run")}
            </Button>
          </div>
          <p className="text-muted-foreground font-mono text-xs">
            {t("networkProbe.cmd.mtu", { target: target.trim() || "…" })}
          </p>
        </>
      }
    >
      {result ? (
        <div className="space-y-2">
          <div className="rounded-lg border px-3 py-2 text-sm">
            <div>
              {t("networkProbe.mtu.status")}:{" "}
              <span
                className={cn(
                  "font-medium",
                  result.status === "blackhole" && "text-destructive",
                  result.status === "ok" && "text-emerald-700 dark:text-emerald-400",
                )}
              >
                {t(`networkProbe.mtu.statusValue.${result.status}`, {
                  defaultValue: result.status,
                })}
              </span>
            </div>
            <div className="text-muted-foreground text-xs">
              {t("networkProbe.mtu.meta", {
                ip: result.resolvedIp,
                method: result.method,
                ms: result.elapsedMs.toFixed(0),
              })}
            </div>
            {result.pathMtu != null ? (
              <div className="mt-1 font-mono text-sm">
                {t("networkProbe.mtu.pathMtu", { value: result.pathMtu })}
              </div>
            ) : null}
            {result.message ? (
              <p className="text-muted-foreground mt-1 text-xs">{result.message}</p>
            ) : null}
            <p className="text-muted-foreground font-mono text-[10px]">{result.commandHint}</p>
          </div>

          {result.steps.length > 0 ? (
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">{t("networkProbe.mtu.col.payload")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("networkProbe.mtu.col.ok")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("networkProbe.mtu.col.detail")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.steps.map((step) => (
                    <tr key={step.payloadBytes} className="border-t">
                      <td className="px-2 py-1.5 font-mono text-xs">{step.payloadBytes}</td>
                      <td
                        className={cn(
                          "px-2 py-1.5 font-mono text-xs",
                          step.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
                        )}
                      >
                        {step.ok ? t("networkProbe.mtu.ok") : t("networkProbe.mtu.fail")}
                      </td>
                      <td className="text-muted-foreground max-w-[16rem] truncate px-2 py-1.5 text-xs">
                        {step.detail ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("networkProbe.mtu.empty")}</p>
      )}
    </ProbePanelShell>
  )
}

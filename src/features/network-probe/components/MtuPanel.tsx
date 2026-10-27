/**
 * Feature UI / 功能界面: path MTU / PMTUD panel (dual entry with Offline).
 */
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbeEmptyState } from "@/features/network-probe/components/ProbeEmptyState"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { MtuTarget, PathMtuResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

interface MtuPanelProps {
  loading: boolean
  result: PathMtuResult | null
  hasError?: boolean
  toolEnabled: boolean
  toolStatus?: string
  mtuTargets?: MtuTarget[]
  onRun: (target: string) => void
  dualFrom?: "offline" | "test"
}

export function MtuPanel({
  loading,
  result,
  hasError = false,
  toolEnabled,
  toolStatus,
  mtuTargets,
  onRun,
  dualFrom,
}: MtuPanelProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState(mtuTargets?.[0]?.target ?? "1.1.1.1")
  const previousTargets = useRef<MtuTarget[] | undefined>(undefined)
  useEffect(() => {
    const previous = previousTargets.current
    const wasConfigured = previous?.some((item) => item.target === target) ?? target === "1.1.1.1"
    if (mtuTargets?.length && wasConfigured && !mtuTargets.some((item) => item.target === target)) {
      setTarget(mtuTargets[0]!.target)
    }
    previousTargets.current = mtuTargets
  }, [mtuTargets, target])
  const resultMessage =
    result?.status === "unsupported" ? t("networkProbe.mtu.unsupportedMessage") : result?.message

  return (
    <ProbePanelShell
      embedded={dualFrom === "offline"}
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.mtu.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "pathMtu",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}
          {dualFrom ? (
            <p className="text-muted-foreground text-xs">
              {t(`networkProbe.dualEntry.from.${dualFrom}`)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            {mtuTargets?.length ? (
              <label className="min-w-[10rem] flex-1 space-y-1">
                <span className="text-xs font-medium">{t("networkProbe.mtu.preset")}</span>
                <select
                  className="border-input bg-background text-foreground focus-visible:ring-ring/50 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={mtuTargets.find((item) => item.target === target)?.id ?? ""}
                  onChange={(event) => {
                    const selected = mtuTargets.find((item) => item.id === event.target.value)
                    setTarget(selected?.target ?? "")
                  }}
                  disabled={loading || !toolEnabled}
                  aria-label={t("networkProbe.mtu.preset")}
                >
                  <option value="">{t("networkProbe.mtu.custom")}</option>
                  {mtuTargets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} — {item.target}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
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
                disabled={loading || !toolEnabled}
              />
            </div>
            <CommandHint hint={t("networkProbe.cmd.mtu", { target: target.trim() || "…" })}>
              <Button
                type="button"
                disabled={loading || !toolEnabled || !target.trim()}
                onClick={() => onRun(target)}
              >
                {loading ? t("networkProbe.mtu.running") : t("networkProbe.mtu.run")}
              </Button>
            </CommandHint>
          </div>
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
            {result.resolvedIp ? (
              <div className="text-muted-foreground text-xs">
                {t("networkProbe.mtu.meta", {
                  ip: result.resolvedIp,
                  method: result.method,
                  ms: result.elapsedMs.toFixed(0),
                })}
              </div>
            ) : null}
            {result.pathMtu != null ? (
              <div className="mt-1 font-mono text-sm">
                {t("networkProbe.mtu.pathMtu", { value: result.pathMtu })}
              </div>
            ) : null}
            {resultMessage ? (
              <p className="text-muted-foreground mt-1 text-xs">{resultMessage}</p>
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
      ) : !loading && !hasError && toolEnabled ? (
        <ProbeEmptyState>{t("networkProbe.mtu.empty")}</ProbeEmptyState>
      ) : null}
    </ProbePanelShell>
  )
}

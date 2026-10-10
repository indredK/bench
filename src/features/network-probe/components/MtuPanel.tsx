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

const MTU_METHOD_LABEL_KEYS: Record<string, string> = {
  "ping-df-binary": "networkProbe.mtu.method.binary",
  "ping-df-ladder": "networkProbe.mtu.method.ladder",
  none: "networkProbe.mtu.method.none",
}

const MTU_STATUS_LABEL_KEYS: Record<string, string> = {
  ok: "networkProbe.mtu.statusValue.ok",
  blackhole: "networkProbe.mtu.statusValue.blackhole",
  fail: "networkProbe.mtu.statusValue.fail",
  unsupported: "networkProbe.mtu.statusValue.unsupported",
  degraded: "networkProbe.mtu.statusValue.degraded",
}

function stepDetailLabelKey(detail: string | undefined, ok: boolean) {
  if (ok) return "networkProbe.mtu.stepDetail.received"

  const normalized = detail?.toLowerCase() ?? ""
  if (normalized.includes("too long") || normalized.includes("packet too big")) {
    return "networkProbe.mtu.stepDetail.packetTooLarge"
  }
  if (normalized.includes("timeout") || normalized.includes("no answer")) {
    return "networkProbe.mtu.stepDetail.timeout"
  }
  if (
    normalized.includes("permission") ||
    normalized.includes("not permitted") ||
    normalized.includes("privilege")
  ) {
    return "networkProbe.mtu.stepDetail.permission"
  }
  return "networkProbe.mtu.stepDetail.failed"
}

function summaryLabelKey(result: PathMtuResult) {
  if (result.status === "blackhole") return "networkProbe.mtu.message.blackhole"
  if (result.status === "unsupported") return "networkProbe.mtu.message.unsupported"
  if (result.status === "fail") return "networkProbe.mtu.message.failed"
  if (result.status === "degraded") return "networkProbe.mtu.message.degraded"
  if (result.status === "ok" && result.message?.toLowerCase().includes("below ethernet")) {
    return "networkProbe.mtu.message.belowEthernet"
  }
  if (Object.hasOwn(MTU_STATUS_LABEL_KEYS, result.status)) return null
  return "networkProbe.mtu.message.unknown"
}

interface MtuPanelProps {
  loading: boolean
  result: PathMtuResult | null
  onRun: (target: string) => void
  dualFrom?: "offline" | "test"
}

export function MtuPanel({ loading, result, onRun, dualFrom }: MtuPanelProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState("1.1.1.1")
  const statusKey =
    result && Object.hasOwn(MTU_STATUS_LABEL_KEYS, result.status)
      ? MTU_STATUS_LABEL_KEYS[result.status]
      : null
  const methodKey =
    result && Object.hasOwn(MTU_METHOD_LABEL_KEYS, result.method)
      ? MTU_METHOD_LABEL_KEYS[result.method]
      : null
  const summaryKey = result ? summaryLabelKey(result) : null

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
                {statusKey ? t(statusKey) : t("networkProbe.mtu.statusValue.unknown")}
              </span>
            </div>
            <div className="text-muted-foreground text-xs">
              {t("networkProbe.mtu.meta", {
                ip: result.resolvedIp,
                method: methodKey ? t(methodKey) : t("networkProbe.mtu.method.unknown"),
                ms: result.elapsedMs.toFixed(0),
              })}
            </div>
            {result.pathMtu != null ? (
              <div className="mt-1 font-mono text-sm">
                {t("networkProbe.mtu.pathMtu", { value: result.pathMtu })}
              </div>
            ) : null}
            {summaryKey ? (
              <p className="text-muted-foreground mt-1 text-xs">{t(summaryKey)}</p>
            ) : null}
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
                      <td className="text-muted-foreground max-w-[16rem] px-2 py-1.5 text-xs">
                        {t(stepDetailLabelKey(step.detail, step.ok))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {result.message || result.commandHint || result.steps.some((step) => step.detail) ? (
            <details className="text-muted-foreground rounded-lg border px-3 py-2 text-xs">
              <summary className="w-fit cursor-pointer select-none">
                {t("networkProbe.mtu.technicalDetails")}
              </summary>
              <div className="mt-2 space-y-2">
                {result.message ? (
                  <p className="break-words">
                    <span className="font-medium">{t("networkProbe.mtu.technicalReason")}:</span>{" "}
                    {result.message}
                  </p>
                ) : null}
                {result.steps.some((step) => step.detail) ? (
                  <ul className="space-y-1">
                    {result.steps.map((step) =>
                      step.detail ? (
                        <li key={step.payloadBytes} className="break-words">
                          {t("networkProbe.mtu.technicalStep", {
                            payload: step.payloadBytes,
                            detail: step.detail,
                          })}
                        </li>
                      ) : null,
                    )}
                  </ul>
                ) : null}
                {result.commandHint ? (
                  <pre className="font-mono break-all whitespace-pre-wrap">
                    {result.commandHint}
                  </pre>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("networkProbe.mtu.empty")}</p>
      )}
    </ProbePanelShell>
  )
}

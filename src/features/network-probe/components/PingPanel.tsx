/**
 * Feature UI / 功能界面: ICMP ping panel for test L1.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NetworkProbeCancelButton } from "@/features/network-probe/components/NetworkProbeCancelButton"
import { ProbeEmptyState } from "@/features/network-probe/components/ProbeEmptyState"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { getPingSampleErrorKey } from "@/features/network-probe/ping-sample-error"
import { parseBoundedIntegerInput } from "@/features/network-probe/integer-input"
import type { PingProbeResult, PingSample } from "@/lib/tauri/types/network-probe"

interface PingPanelProps {
  loading: boolean
  result: PingProbeResult | null
  streamingSamples: PingSample[]
  hasError?: boolean
  toolEnabled: boolean
  toolStatus?: string
  canCancel: boolean
  cancelling: boolean
  onRun: (target: string, count: number) => void
  onCancel: () => void
}

export function PingPanel({
  loading,
  result,
  streamingSamples,
  hasError = false,
  toolEnabled,
  toolStatus,
  canCancel,
  cancelling,
  onRun,
  onCancel,
}: PingPanelProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState("1.1.1.1")
  const [count, setCount] = useState("4")
  const parsedCount = parseBoundedIntegerInput(count, 1, 20)
  const countError = parsedCount == null
  const showLocalNetworkHint =
    result != null && result.packetsSent > 0 && result.packetsReceived === 0
  const samples = result?.samples ?? streamingSamples

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.ping.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "ping",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-ping-target">
                {t("networkProbe.ping.target")}
              </label>
              <Input
                id="np-ping-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                autoComplete="off"
                disabled={loading}
              />
            </div>
            <div className="w-24 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-ping-count">
                {t("networkProbe.ping.count")}
              </label>
              <Input
                id="np-ping-count"
                type="number"
                min={1}
                max={20}
                step={1}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                autoComplete="off"
                disabled={loading}
                aria-invalid={countError}
                aria-describedby={countError ? "np-ping-count-error" : undefined}
              />
              {countError ? (
                <p id="np-ping-count-error" className="text-destructive text-xs" role="alert">
                  {t("networkProbe.ping.countInvalid")}
                </p>
              ) : null}
            </div>
            {loading ? (
              <NetworkProbeCancelButton
                label={t("networkProbe.ping.cancel")}
                cancelling={cancelling}
                disabled={!canCancel}
                onCancel={onCancel}
              />
            ) : (
              <CommandHint
                hint={t("networkProbe.cmd.pingHost", {
                  target: target.trim() || "…",
                  count: count || "…",
                })}
              >
                <Button
                  type="button"
                  disabled={!toolEnabled || !target.trim() || parsedCount == null}
                  onClick={() => {
                    if (parsedCount != null) onRun(target, parsedCount)
                  }}
                >
                  {t("networkProbe.ping.run")}
                </Button>
              </CommandHint>
            )}
          </div>
        </>
      }
    >
      {showLocalNetworkHint ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.caps.localNetworkHint")}
        </p>
      ) : null}
      {!loading && !result && !hasError && toolEnabled ? (
        <ProbeEmptyState>{t("networkProbe.resultEmpty")}</ProbeEmptyState>
      ) : null}
      {loading ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t("networkProbe.ping.progress", {
            sent: streamingSamples.length,
            total: parsedCount ?? count,
          })}
        </p>
      ) : null}
      {result?.cancelled ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t("networkProbe.ping.cancelled")}
        </p>
      ) : null}
      {result ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          {result.resolvedIp ? (
            <div>
              {t("networkProbe.ping.resolved")}:{" "}
              <span className="font-mono font-medium">{result.resolvedIp}</span>
            </div>
          ) : null}
          <div>
            {t("networkProbe.ping.summary", {
              sent: result.packetsSent,
              received: result.packetsReceived,
              loss: result.lossPercent.toFixed(0),
            })}
          </div>
          {result.avgRttMs != null ? (
            <div>
              {t("networkProbe.ping.rttSummary", {
                min: result.minRttMs?.toFixed(1) ?? "—",
                avg: result.avgRttMs.toFixed(1),
                max: result.maxRttMs?.toFixed(1) ?? "—",
                jitter: result.stddevRttMs?.toFixed(1) ?? "—",
              })}
            </div>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
      {samples.length > 0 ? (
        <ul className="text-muted-foreground max-h-64 space-y-0.5 overflow-y-auto font-mono text-xs">
          {samples.map((s) => (
            <li key={s.seq}>
              {s.ok
                ? t("networkProbe.ping.sampleOk", {
                    seq: s.seq,
                    ms: s.rttMs?.toFixed(1) ?? "—",
                  })
                : t("networkProbe.ping.sampleFail", {
                    seq: s.seq,
                    error: t(getPingSampleErrorKey(s.error)),
                  })}
            </li>
          ))}
        </ul>
      ) : null}
    </ProbePanelShell>
  )
}

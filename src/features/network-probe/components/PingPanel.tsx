/**
 * Feature UI / 功能界面: ICMP ping panel for test L1.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { PingProbeResult } from "@/lib/tauri/types/network-probe"

interface PingPanelProps {
  loading: boolean
  result: PingProbeResult | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: (target: string, count: number) => void
}

export function PingPanel({ loading, result, toolEnabled, toolStatus, onRun }: PingPanelProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState("1.1.1.1")
  const [count, setCount] = useState("4")
  const showLocalNetworkHint =
    result != null && result.packetsSent > 0 && result.packetsReceived === 0

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
              />
            </div>
            <div className="w-24 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-ping-count">
                {t("networkProbe.ping.count")}
              </label>
              <Input
                id="np-ping-count"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <CommandHint
              hint={t("networkProbe.cmd.pingHost", {
                target: target.trim() || "…",
                count: count || "…",
              })}
            >
              <Button
                type="button"
                disabled={loading || !toolEnabled || !target.trim() || !Number(count)}
                onClick={() => onRun(target, Number(count))}
              >
                {loading ? t("networkProbe.ping.running") : t("networkProbe.ping.run")}
              </Button>
            </CommandHint>
          </div>
        </>
      }
    >
      {showLocalNetworkHint ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.caps.localNetworkHint")}
        </p>
      ) : null}
      {result ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.ping.resolved")}:{" "}
            <span className="font-mono font-medium">{result.resolvedIp}</span>
          </div>
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
          <ul className="text-muted-foreground space-y-0.5 font-mono text-xs">
            {result.samples.map((s) => (
              <li key={s.seq}>
                {s.ok
                  ? t("networkProbe.ping.sampleOk", {
                      seq: s.seq,
                      ms: s.rttMs?.toFixed(1) ?? "—",
                    })
                  : t("networkProbe.ping.sampleFail", {
                      seq: s.seq,
                      error: s.error ?? "timeout",
                    })}
              </li>
            ))}
          </ul>
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

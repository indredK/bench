/**
 * Feature UI / 功能界面: traceroute / MTR hop table.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { ProbeCancelButton } from "@/features/network-probe/components/ProbeCancelButton"
import { VirtualizedTracerouteTable } from "@/features/network-probe/components/VirtualizedTracerouteTable"
import type { TracerouteHop, TracerouteResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

interface TraceroutePanelProps {
  loading: boolean
  canCancel: boolean
  cancelling?: boolean
  result: TracerouteResult | null
  streamingHops: TracerouteHop[]
  toolEnabled: boolean
  toolStatus?: string
  onRun: (target: string, maxTtl: number, rounds: number) => void
  onCancel: () => void
}

export function TraceroutePanel({
  loading,
  canCancel,
  cancelling = false,
  result,
  streamingHops,
  toolEnabled,
  toolStatus,
  onRun,
  onCancel,
}: TraceroutePanelProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState("1.1.1.1")
  const [maxTtl, setMaxTtl] = useState("20")
  const [rounds, setRounds] = useState("3")

  // 跑动中只渲染本轮 streaming 跳数: 旧 result 优先会遮蔽新一轮逐跳进度。
  const hops = loading ? streamingHops : result?.hops?.length ? result.hops : streamingHops
  const modeKey = result?.privilegeMode
    ? `networkProbe.traceroute.mode.${result.privilegeMode}`
    : null

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.traceroute.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "traceroute",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-tr-target">
                {t("networkProbe.traceroute.target")}
              </label>
              <Input
                id="np-tr-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                autoComplete="off"
                disabled={loading}
              />
            </div>
            <div className="w-20 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-tr-ttl">
                {t("networkProbe.traceroute.maxTtl")}
              </label>
              <Input
                id="np-tr-ttl"
                value={maxTtl}
                onChange={(e) => setMaxTtl(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                disabled={loading}
              />
            </div>
            <div className="w-20 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-tr-rounds">
                {t("networkProbe.traceroute.rounds")}
              </label>
              <Input
                id="np-tr-rounds"
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                disabled={loading}
              />
            </div>
            <CommandHint
              hint={t("networkProbe.cmd.traceroute", {
                target: target.trim() || "…",
                maxTtl: maxTtl || "…",
                rounds: rounds || "…",
              })}
            >
              <Button
                type="button"
                disabled={
                  loading || !toolEnabled || !target.trim() || !Number(maxTtl) || !Number(rounds)
                }
                onClick={() => onRun(target, Number(maxTtl), Number(rounds))}
              >
                {loading ? t("networkProbe.traceroute.running") : t("networkProbe.traceroute.run")}
              </Button>
            </CommandHint>
            {canCancel ? (
              <ProbeCancelButton
                canCancel={canCancel}
                cancelling={cancelling}
                cancelLabel={t("networkProbe.traceroute.cancel")}
                onCancel={onCancel}
              />
            ) : null}
          </div>
        </>
      }
    >
      {result ? (
        <div className="text-muted-foreground space-y-1 text-xs">
          <div>
            {t("networkProbe.traceroute.meta", {
              ip: result.resolvedIp,
              mode: modeKey ? t(modeKey, { defaultValue: result.privilegeMode }) : "—",
              ms: result.elapsedMs.toFixed(0),
            })}
            {result.cancelled ? (
              <span className="ml-2">{t("networkProbe.traceroute.cancelled")}</span>
            ) : null}
          </div>
          {result.message ? <div>{result.message}</div> : null}
        </div>
      ) : null}

      {hops.length === 0 && !loading ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.traceroute.empty")}</p>
      ) : null}

      {hops.length > 0 ? (
        <VirtualizedTracerouteTable
          hops={hops}
          ariaLabel={t("networkProbe.traceroute.results")}
          followTail={loading}
          columnLabels={[
            t("networkProbe.traceroute.col.ttl"),
            t("networkProbe.traceroute.col.addr"),
            t("networkProbe.traceroute.col.asn"),
            t("networkProbe.traceroute.col.loss"),
            t("networkProbe.traceroute.col.avg"),
            t("networkProbe.traceroute.col.best"),
            t("networkProbe.traceroute.col.worst"),
          ]}
          renderCells={(hop) => [
            <span className="font-mono text-xs">{hop.ttl}</span>,
            <span
              className="block max-w-[12rem] truncate font-mono text-xs"
              title={hop.addrs.join(", ")}
            >
              {hop.addrs.length > 0 ? hop.addrs.join(", ") : "*"}
            </span>,
            <span className="block max-w-[10rem] truncate text-xs" title={hop.asName ?? hop.asn}>
              {hop.asn ? (
                <>
                  <span className="font-mono">{hop.asn}</span>
                  {hop.asName ? <span className="text-muted-foreground"> {hop.asName}</span> : null}
                </>
              ) : (
                "—"
              )}
            </span>,
            <span
              className={cn(
                "font-mono text-xs",
                hop.lossPercent >= 50 && "text-destructive",
                hop.lossPercent > 0 && hop.lossPercent < 50 && "text-amber-700 dark:text-amber-400",
              )}
            >
              {hop.lossPercent.toFixed(0)}%
            </span>,
            <span className="font-mono text-xs">
              {hop.avgRttMs != null ? hop.avgRttMs.toFixed(1) : "—"}
            </span>,
            <span className="font-mono text-xs">
              {hop.bestRttMs != null ? hop.bestRttMs.toFixed(1) : "—"}
            </span>,
            <span className="font-mono text-xs">
              {hop.worstRttMs != null ? hop.worstRttMs.toFixed(1) : "—"}
            </span>,
          ]}
        />
      ) : null}

      {result?.commandHint ? (
        <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
      ) : null}
    </ProbePanelShell>
  )
}

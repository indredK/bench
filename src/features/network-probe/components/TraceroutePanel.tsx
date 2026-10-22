/**
 * Feature UI / 功能界面: traceroute / MTR hop table.
 */
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useVirtualizer } from "@tanstack/react-virtual"
import { CommandHint } from "@/components/common/CommandHint"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { TracerouteHop, TracerouteResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

const VIRTUALIZE_HOPS_AFTER = 50
const ESTIMATED_HOP_ROW_HEIGHT = 36
const HOP_GRID_COLUMNS =
  "3.5rem minmax(12rem, 1.3fr) minmax(10rem, 1fr) repeat(4, minmax(4.5rem, 0.55fr))"

interface TraceroutePanelProps {
  loading: boolean
  canCancel: boolean
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
  const hopScrollRef = useRef<HTMLDivElement>(null)
  const virtualizedHops = hops.length >= VIRTUALIZE_HOPS_AFTER
  const hopVirtualizer = useVirtualizer({
    count: virtualizedHops ? hops.length : 0,
    getScrollElement: () => hopScrollRef.current,
    getItemKey: (index) => hops[index]?.ttl ?? index,
    estimateSize: () => ESTIMATED_HOP_ROW_HEIGHT,
    overscan: 8,
    initialRect: { width: 1024, height: 284 },
  })
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
              <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
                <Button type="button" variant="outline" onClick={onCancel}>
                  {t("networkProbe.traceroute.cancel")}
                </Button>
              </CommandHint>
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
        <ScrollableArea
          ref={hopScrollRef}
          aria-label={t("networkProbe.traceroute.hopsLabel")}
          tabIndex={0}
          className="focus-visible:ring-ring max-h-80 overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:outline-none"
          data-traceroute-hop-list
          data-virtualized={virtualizedHops ? "true" : "false"}
          data-total-count={hops.length}
        >
          <div
            role="table"
            aria-label={t("networkProbe.traceroute.hopsLabel")}
            aria-rowcount={hops.length + 1}
            aria-colcount={7}
            className="min-w-[50rem] text-left text-sm"
          >
            <div
              role="rowgroup"
              className="bg-muted/50 text-muted-foreground sticky top-0 z-10 text-xs"
            >
              <div
                role="row"
                className="grid h-9 items-center"
                style={{ gridTemplateColumns: HOP_GRID_COLUMNS }}
              >
                {[
                  t("networkProbe.traceroute.col.ttl"),
                  t("networkProbe.traceroute.col.addr"),
                  t("networkProbe.traceroute.col.asn"),
                  t("networkProbe.traceroute.col.loss"),
                  t("networkProbe.traceroute.col.avg"),
                  t("networkProbe.traceroute.col.best"),
                  t("networkProbe.traceroute.col.worst"),
                ].map((label, index) => (
                  <div key={index} role="columnheader" className="truncate px-2 font-medium">
                    {label}
                  </div>
                ))}
              </div>
            </div>
            <div
              role="rowgroup"
              style={
                virtualizedHops
                  ? { height: `${hopVirtualizer.getTotalSize()}px`, position: "relative" }
                  : undefined
              }
            >
              {(virtualizedHops
                ? hopVirtualizer
                    .getVirtualItems()
                    .map((row) => ({ index: row.index, virtualRow: row }))
                : hops.map((_, index) => ({ index, virtualRow: null }))
              ).map(({ index, virtualRow }) => {
                const hop = hops[index]
                if (!hop) return null
                return (
                  <div
                    key={hop.ttl}
                    role="row"
                    aria-rowindex={index + 2}
                    className={cn(
                      "grid h-9 items-center border-t",
                      virtualRow && "absolute top-0 left-0 w-full",
                    )}
                    style={{
                      gridTemplateColumns: HOP_GRID_COLUMNS,
                      ...(virtualRow
                        ? {
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }
                        : {}),
                    }}
                  >
                    <div role="cell" className="px-2 font-mono text-xs">
                      {hop.ttl}
                    </div>
                    <div role="cell" className="truncate px-2 font-mono text-xs">
                      {hop.addrs.length > 0 ? hop.addrs.join(", ") : "*"}
                    </div>
                    <div
                      role="cell"
                      className="truncate px-2 text-xs"
                      title={hop.asName ?? hop.asn}
                    >
                      {hop.asn ? (
                        <span>
                          <span className="font-mono">{hop.asn}</span>
                          {hop.asName ? (
                            <span className="text-muted-foreground"> {hop.asName}</span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </div>
                    <div
                      role="cell"
                      className={cn(
                        "px-2 font-mono text-xs",
                        hop.lossPercent >= 50 && "text-destructive",
                        hop.lossPercent > 0 &&
                          hop.lossPercent < 50 &&
                          "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {hop.lossPercent.toFixed(0)}%
                    </div>
                    <div role="cell" className="px-2 font-mono text-xs">
                      {hop.avgRttMs != null ? hop.avgRttMs.toFixed(1) : "—"}
                    </div>
                    <div role="cell" className="px-2 font-mono text-xs">
                      {hop.bestRttMs != null ? hop.bestRttMs.toFixed(1) : "—"}
                    </div>
                    <div role="cell" className="px-2 font-mono text-xs">
                      {hop.worstRttMs != null ? hop.worstRttMs.toFixed(1) : "—"}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </ScrollableArea>
      ) : null}

      {result?.commandHint ? (
        <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
      ) : null}
    </ProbePanelShell>
  )
}

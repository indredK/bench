/**
 * Feature UI / 功能界面: traceroute / MTR hop table.
 */
import { useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { ScanCancelButton } from "@/features/network-probe/components/ScanCancelButton"
import type { TracerouteHop, TracerouteResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

const TRACEROUTE_MODE_LABEL_KEYS: Record<string, string> = {
  privileged: "networkProbe.traceroute.mode.privileged",
  unprivileged: "networkProbe.traceroute.mode.unprivileged",
  unavailable: "networkProbe.traceroute.mode.unavailable",
  cancelled: "networkProbe.traceroute.mode.cancelled",
}

const TRACEROUTE_VIRTUALIZATION_THRESHOLD = 16

interface TraceroutePanelProps {
  loading: boolean
  canCancel: boolean
  cancelRequested: boolean
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
  cancelRequested,
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
  const hopsScrollRef = useRef<HTMLDivElement>(null)
  const maxTtlValue = Number(maxTtl)
  const roundsValue = Number(rounds)
  const maxTtlIsValid = Number.isInteger(maxTtlValue) && maxTtlValue >= 1 && maxTtlValue <= 32
  const roundsIsValid = Number.isInteger(roundsValue) && roundsValue >= 1 && roundsValue <= 10
  const showMaxTtlValidation = maxTtl.length > 0 && !maxTtlIsValid
  const showRoundsValidation = rounds.length > 0 && !roundsIsValid

  // 跑动中只渲染本轮 streaming 跳数: 旧 result 优先会遮蔽新一轮逐跳进度。
  const hops = loading ? streamingHops : result?.hops?.length ? result.hops : streamingHops
  const shouldVirtualizeHops = hops.length > TRACEROUTE_VIRTUALIZATION_THRESHOLD
  const hopsVirtualizer = useVirtualizer({
    count: shouldVirtualizeHops ? hops.length : 0,
    getScrollElement: () => hopsScrollRef.current,
    getItemKey: (index) => hops[index]?.ttl ?? index,
    estimateSize: () => 36,
    overscan: 6,
    initialRect: { width: 960, height: 288 },
  })
  const virtualHops = shouldVirtualizeHops
    ? hopsVirtualizer.getVirtualItems()
    : hops.map((hop, index) => ({ index, key: hop.ttl, start: 0, size: 36 }))
  const totalHopSize = hopsVirtualizer.getTotalSize()
  const firstVirtualHop = virtualHops[0]
  const lastVirtualHop = virtualHops.at(-1)
  const topPadding = firstVirtualHop?.start ?? 0
  const bottomPadding = lastVirtualHop
    ? Math.max(totalHopSize - lastVirtualHop.start - lastVirtualHop.size, 0)
    : 0
  const modeKey =
    result && Object.hasOwn(TRACEROUTE_MODE_LABEL_KEYS, result.privilegeMode)
      ? TRACEROUTE_MODE_LABEL_KEYS[result.privilegeMode]
      : null
  const messageKey = result?.cancelled
    ? null
    : result?.privilegeMode === "unprivileged"
      ? "networkProbe.traceroute.message.unprivileged"
      : result?.privilegeMode === "unavailable"
        ? "networkProbe.traceroute.message.unavailable"
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
                type="number"
                min={1}
                max={32}
                step={1}
                aria-invalid={showMaxTtlValidation}
                aria-describedby={showMaxTtlValidation ? "np-tr-ttl-error" : undefined}
                inputMode="numeric"
                autoComplete="off"
                disabled={loading}
              />
              {showMaxTtlValidation ? (
                <p id="np-tr-ttl-error" className="text-destructive text-xs">
                  {t("networkProbe.traceroute.maxTtlInvalid")}
                </p>
              ) : null}
            </div>
            <div className="w-20 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-tr-rounds">
                {t("networkProbe.traceroute.rounds")}
              </label>
              <Input
                id="np-tr-rounds"
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
                type="number"
                min={1}
                max={10}
                step={1}
                aria-invalid={showRoundsValidation}
                aria-describedby={showRoundsValidation ? "np-tr-rounds-error" : undefined}
                inputMode="numeric"
                autoComplete="off"
                disabled={loading}
              />
              {showRoundsValidation ? (
                <p id="np-tr-rounds-error" className="text-destructive text-xs">
                  {t("networkProbe.traceroute.roundsInvalid")}
                </p>
              ) : null}
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
                  loading || !toolEnabled || !target.trim() || !maxTtlIsValid || !roundsIsValid
                }
                onClick={() => {
                  if (maxTtlIsValid && roundsIsValid) onRun(target, maxTtlValue, roundsValue)
                }}
              >
                {loading ? t("networkProbe.traceroute.running") : t("networkProbe.traceroute.run")}
              </Button>
            </CommandHint>
            {canCancel ? (
              <ScanCancelButton
                label={t("networkProbe.traceroute.cancel")}
                cancelRequested={cancelRequested}
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
              mode: modeKey ? t(modeKey) : "—",
              ms: result.elapsedMs.toFixed(0),
            })}
            {result.cancelled ? (
              <span className="ml-2">{t("networkProbe.traceroute.cancelled")}</span>
            ) : null}
          </div>
          {messageKey ? <div>{t(messageKey)}</div> : null}
          {result.message || result.commandHint ? (
            <details className="text-xs">
              <summary className="w-fit cursor-pointer select-none">
                {t("networkProbe.traceroute.technicalDetails")}
              </summary>
              <div className="mt-1 space-y-1">
                {result.message ? (
                  <p className="break-words">
                    <span className="font-medium">
                      {t("networkProbe.traceroute.technicalReason")}:
                    </span>{" "}
                    {result.message}
                  </p>
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
      ) : null}

      {hops.length === 0 && !loading ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.traceroute.empty")}</p>
      ) : null}

      {hops.length > 0 ? (
        <div
          ref={hopsScrollRef}
          role="region"
          aria-label={t("networkProbe.traceroute.tableRegion")}
          tabIndex={shouldVirtualizeHops ? 0 : undefined}
          className={
            shouldVirtualizeHops
              ? "max-h-72 overflow-auto rounded-lg border"
              : "overflow-x-auto rounded-lg border"
          }
          style={shouldVirtualizeHops ? { height: `${Math.min(totalHopSize, 288)}px` } : undefined}
          data-traceroute-scroll
        >
          <table
            className="w-full text-left text-sm"
            aria-rowcount={hops.length + 1}
            data-traceroute-table
          >
            <caption className="sr-only">{t("networkProbe.traceroute.tableCaption")}</caption>
            <thead className="bg-muted text-muted-foreground sticky top-0 z-10 text-xs">
              <tr>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  {t("networkProbe.traceroute.col.ttl")}
                </th>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  {t("networkProbe.traceroute.col.addr")}
                </th>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  {t("networkProbe.traceroute.col.asn")}
                </th>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  {t("networkProbe.traceroute.col.loss")}
                </th>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  {t("networkProbe.traceroute.col.avg")}
                </th>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  {t("networkProbe.traceroute.col.best")}
                </th>
                <th scope="col" className="px-2 py-1.5 font-medium">
                  {t("networkProbe.traceroute.col.worst")}
                </th>
              </tr>
            </thead>
            <tbody>
              {shouldVirtualizeHops && topPadding > 0 ? (
                <tr aria-hidden="true" className="border-0">
                  <td colSpan={7} className="border-0 p-0" style={{ height: `${topPadding}px` }} />
                </tr>
              ) : null}
              {virtualHops.map((virtualHop) => {
                const hop = hops[virtualHop.index]
                if (!hop) return null
                return (
                  <tr
                    key={virtualHop.key}
                    ref={shouldVirtualizeHops ? hopsVirtualizer.measureElement : undefined}
                    data-index={shouldVirtualizeHops ? virtualHop.index : undefined}
                    aria-rowindex={virtualHop.index + 2}
                    className="border-t"
                  >
                    <td className="px-2 py-1.5 font-mono text-xs">{hop.ttl}</td>
                    <td className="max-w-[12rem] truncate px-2 py-1.5 font-mono text-xs">
                      {hop.addrs.length > 0 ? hop.addrs.join(", ") : "*"}
                    </td>
                    <td
                      className="max-w-[10rem] truncate px-2 py-1.5 text-xs"
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
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 font-mono text-xs",
                        hop.lossPercent >= 50 && "text-destructive",
                        hop.lossPercent > 0 &&
                          hop.lossPercent < 50 &&
                          "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {hop.lossPercent.toFixed(0)}%
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">
                      {hop.avgRttMs != null ? hop.avgRttMs.toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">
                      {hop.bestRttMs != null ? hop.bestRttMs.toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-xs">
                      {hop.worstRttMs != null ? hop.worstRttMs.toFixed(1) : "—"}
                    </td>
                  </tr>
                )
              })}
              {shouldVirtualizeHops && bottomPadding > 0 ? (
                <tr aria-hidden="true" className="border-0">
                  <td
                    colSpan={7}
                    className="border-0 p-0"
                    style={{ height: `${bottomPadding}px` }}
                  />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

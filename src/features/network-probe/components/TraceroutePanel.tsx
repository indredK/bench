/**
 * Feature UI / 功能界面: traceroute / MTR hop table.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TracerouteHop, TracerouteResult } from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

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

  const hops = result?.hops?.length ? result.hops : streamingHops
  const modeKey = result?.privilegeMode
    ? `networkProbe.traceroute.mode.${result.privilegeMode}`
    : null

  return (
    <div className="space-y-4">
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
        <div className="overflow-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="px-2 py-1.5 font-medium">{t("networkProbe.traceroute.col.ttl")}</th>
                <th className="px-2 py-1.5 font-medium">{t("networkProbe.traceroute.col.addr")}</th>
                <th className="px-2 py-1.5 font-medium">{t("networkProbe.traceroute.col.asn")}</th>
                <th className="px-2 py-1.5 font-medium">{t("networkProbe.traceroute.col.loss")}</th>
                <th className="px-2 py-1.5 font-medium">{t("networkProbe.traceroute.col.avg")}</th>
                <th className="px-2 py-1.5 font-medium">{t("networkProbe.traceroute.col.best")}</th>
                <th className="px-2 py-1.5 font-medium">
                  {t("networkProbe.traceroute.col.worst")}
                </th>
              </tr>
            </thead>
            <tbody>
              {hops.map((hop) => (
                <tr key={hop.ttl} className="border-t">
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
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {result?.commandHint ? (
        <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
      ) : null}
    </div>
  )
}

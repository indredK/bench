/**
 * Feature UI / 功能界面: ICMP ping panel for test L1.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type {
  GlobalpingPingResult,
  PingProbeResult,
  PingSample,
} from "@/lib/tauri/types/network-probe"

interface PingPanelProps {
  loading: boolean
  result: PingProbeResult | null
  streamingSamples?: PingSample[]
  remoteResult?: GlobalpingPingResult | null
  remoteMode?: boolean
  remoteLocationLabel?: string
  platform?: string
  toolEnabled: boolean
  toolStatus?: string
  canCancel?: boolean
  cancelRequested?: boolean
  onRun: (target: string, count: number) => void
  onCancel?: () => void
}

const LOCAL_MAX_COUNT = 20
const GLOBALPING_MAX_COUNT = 16

export function PingPanel({
  loading,
  result,
  streamingSamples = [],
  remoteResult,
  remoteMode = false,
  remoteLocationLabel,
  platform,
  toolEnabled,
  toolStatus,
  canCancel = false,
  cancelRequested = false,
  onRun,
  onCancel,
}: PingPanelProps) {
  const { t } = useTranslation()
  const [target, setTarget] = useState("1.1.1.1")
  const [count, setCount] = useState("4")
  const maxCount = remoteMode ? GLOBALPING_MAX_COUNT : LOCAL_MAX_COUNT
  const countValue = Number(count)
  const countIsValid = Number.isInteger(countValue) && countValue >= 1 && countValue <= maxCount
  const showCountValidation = count.length > 0 && !countIsValid
  const showLocalNetworkHint =
    result != null && result.packetsSent > 0 && result.packetsReceived === 0
  const localFailureDetails = result?.samples.filter((sample) => !sample.ok && sample.error) ?? []
  const localSamples = loading ? streamingSamples : (result?.samples ?? [])

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">
            {t(remoteMode ? "networkProbe.globalping.pingHint" : "networkProbe.ping.hint")}
          </p>
          {remoteMode ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.globalping.publicTargetHint")}
            </p>
          ) : null}
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
                value={count}
                onChange={(e) => setCount(e.target.value)}
                type="number"
                min={1}
                max={maxCount}
                step={1}
                aria-invalid={showCountValidation}
                aria-describedby={showCountValidation ? "np-ping-count-error" : undefined}
                autoComplete="off"
                disabled={loading}
              />
              {showCountValidation ? (
                <p id="np-ping-count-error" className="text-destructive text-xs">
                  {t("networkProbe.ping.countInvalid", { min: 1, max: maxCount })}
                </p>
              ) : null}
            </div>
            <CommandHint
              hint={
                remoteMode
                  ? t("networkProbe.globalping.remotePingCommandHint", {
                      location: remoteLocationLabel ?? t("networkProbe.globalping.locations.world"),
                    })
                  : t("networkProbe.cmd.pingHost", {
                      target: target.trim() || "…",
                      count: count || "…",
                    })
              }
            >
              <Button
                type="button"
                disabled={loading || !toolEnabled || !target.trim() || !countIsValid}
                onClick={() => {
                  if (countIsValid) onRun(target, countValue)
                }}
              >
                {loading ? t("networkProbe.ping.running") : t("networkProbe.ping.run")}
              </Button>
            </CommandHint>
            {canCancel && !remoteMode ? (
              <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={cancelRequested}
                  onClick={onCancel}
                >
                  {cancelRequested
                    ? t("networkProbe.ping.cancelling")
                    : t("networkProbe.ping.cancel")}
                </Button>
              </CommandHint>
            ) : null}
          </div>
          {remoteMode ? (
            <p className="text-muted-foreground text-xs">
              {t("networkProbe.globalping.packetLimit")}
            </p>
          ) : null}
        </>
      }
    >
      {showLocalNetworkHint ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t(
            platform === "macos"
              ? "networkProbe.ping.noRepliesMacHint"
              : "networkProbe.ping.noRepliesHint",
          )}
        </p>
      ) : null}
      {result || localSamples.length > 0 ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          {result ? (
            <div>
              {t("networkProbe.ping.resolved")}:{" "}
              <span className="font-mono font-medium">{result.resolvedIp}</span>
            </div>
          ) : null}
          {result ? (
            <>
              <div>
                {t("networkProbe.ping.summary", {
                  sent: result.packetsSent,
                  received: result.packetsReceived,
                  loss: result.lossPercent.toFixed(0),
                })}
                {result.cancelled ? (
                  <span className="text-muted-foreground ml-2">
                    {t("networkProbe.ping.cancelled")}
                  </span>
                ) : null}
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
            </>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{t("networkProbe.ping.liveResults")}</caption>
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    {t("networkProbe.ping.sequence")}
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    {t("networkProbe.ping.status")}
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {t("networkProbe.ping.rtt")}
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {localSamples.map((sample) => (
                  <tr key={sample.seq} className="border-b last:border-0">
                    <td className="py-1 pr-4">{sample.seq + 1}</td>
                    <td className="text-muted-foreground py-1 pr-4">
                      {sample.ok ? t("networkProbe.ping.reply") : t("networkProbe.ping.noResponse")}
                    </td>
                    <td className="py-1 text-right">
                      {sample.rttMs == null ? "—" : `${sample.rttMs.toFixed(1)} ms`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {localFailureDetails.length > 0 ? (
            <details className="text-muted-foreground text-xs">
              <summary className="w-fit cursor-pointer">
                {t("networkProbe.ping.technicalDetails")}
              </summary>
              <ul className="mt-1 space-y-1 font-mono break-all">
                {localFailureDetails.map((sample) => (
                  <li key={sample.seq}>
                    #{sample.seq + 1}: {sample.error}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {result ? (
            <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
          ) : null}
        </div>
      ) : null}
      {remoteResult ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div className="font-medium">
            {t("networkProbe.globalping.resultFrom", {
              location: remoteLocationLabel ?? remoteResult.location,
            })}
          </div>
          {remoteResult.probeCity || remoteResult.probeCountry ? (
            <div className="text-muted-foreground text-xs">
              {t("networkProbe.globalping.actualProbeLocation", {
                city: remoteResult.probeCity ?? "—",
                country: remoteResult.probeCountry ?? "—",
              })}
            </div>
          ) : null}
          {remoteResult.resolvedAddress ? (
            <div>
              {t("networkProbe.ping.resolved")}:{" "}
              <span className="font-mono font-medium">{remoteResult.resolvedAddress}</span>
            </div>
          ) : null}
          <div>
            {t("networkProbe.ping.summary", {
              sent: remoteResult.packetsSent,
              received: remoteResult.packetsReceived,
              loss: remoteResult.lossPercent.toFixed(0),
            })}
          </div>
          {remoteResult.avgRttMs != null ? (
            <div>
              {t("networkProbe.ping.rttSummary", {
                min: remoteResult.minRttMs?.toFixed(1) ?? "—",
                avg: remoteResult.avgRttMs.toFixed(1),
                max: remoteResult.maxRttMs?.toFixed(1) ?? "—",
                jitter: "—",
              })}
            </div>
          ) : null}
          <ul className="text-muted-foreground space-y-0.5 font-mono text-xs">
            {remoteResult.samples.map((sample) => (
              <li key={sample.seq}>
                {sample.rttMs != null
                  ? t("networkProbe.ping.sampleOk", {
                      seq: sample.seq,
                      ms: sample.rttMs.toFixed(1),
                    })
                  : t("networkProbe.ping.sampleFail", {
                      seq: sample.seq,
                      error: t("networkProbe.globalping.packetLost"),
                    })}
              </li>
            ))}
          </ul>
          <div className="text-muted-foreground font-mono text-xs">{remoteResult.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

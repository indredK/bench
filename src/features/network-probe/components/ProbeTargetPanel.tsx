/**
 * Feature UI / 功能界面: custom host/URL probe panel.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { redactProbeTargetForDisplay } from "@/features/network-probe/utils/probe-target-display"
import type { GlobalpingHttpResult, ProbeTargetResult } from "@/lib/tauri/types/network-probe"

interface ProbeTargetPanelProps {
  loading: boolean
  result: ProbeTargetResult | null
  remoteResult?: GlobalpingHttpResult | null
  remoteMode?: boolean
  remoteLocationLabel?: string
  onRun: (input: string) => void
}

export function ProbeTargetPanel({
  loading,
  result,
  remoteResult,
  remoteMode = false,
  remoteLocationLabel,
  onRun,
}: ProbeTargetPanelProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState("https://example.com")

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">
            {t(remoteMode ? "networkProbe.globalping.httpHint" : "networkProbe.probe.hint")}
          </p>
          {remoteMode ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.globalping.httpPrivacyHint")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-probe-input">
                {t("networkProbe.probe.input")}
              </label>
              <Input
                id="np-probe-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoComplete="off"
              />
            </div>
            <CommandHint
              hint={
                remoteMode
                  ? t("networkProbe.globalping.remoteHttpCommandHint", {
                      location: remoteLocationLabel ?? t("networkProbe.globalping.locations.world"),
                    })
                  : t("networkProbe.cmd.probeTarget", {
                      input: redactProbeTargetForDisplay(input) || "…",
                    })
              }
            >
              <Button
                type="button"
                disabled={loading || !input.trim()}
                onClick={() => onRun(input)}
              >
                {loading ? t("networkProbe.probe.running") : t("networkProbe.probe.run")}
              </Button>
            </CommandHint>
          </div>
        </>
      }
    >
      {result ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.probe.kind")}: <span className="font-medium">{result.kind}</span>
          </div>
          {result.icmp ? (
            <div>
              {t("networkProbe.probe.icmp")}:{" "}
              {result.icmp.ok
                ? t("networkProbe.probe.icmpOk", {
                    ms: result.icmp.rttMs?.toFixed(1) ?? "—",
                    ip: result.icmp.resolvedIp ?? "—",
                  })
                : t("networkProbe.probe.icmpFail", {
                    error: result.icmp.error ?? "—",
                  })}
            </div>
          ) : null}
          {result.http ? (
            <div>
              {t("networkProbe.probe.http")}:{" "}
              {result.http.ok
                ? t("networkProbe.probe.httpOk", {
                    status: result.http.status ?? "—",
                    ms: result.http.ttfbMs?.toFixed(0) ?? "—",
                  })
                : result.http.status != null
                  ? t("networkProbe.probe.httpStatusFail", {
                      status: result.http.status,
                      ms: result.http.ttfbMs?.toFixed(0) ?? "—",
                    })
                  : t("networkProbe.probe.httpRequestFail")}
              {result.http.finalUrl ? (
                <div className="text-muted-foreground font-mono text-xs">
                  {redactProbeTargetForDisplay(result.http.finalUrl)}
                </div>
              ) : null}
            </div>
          ) : null}
          {result.tls ? (
            <div>
              {t("networkProbe.probe.tls")}:{" "}
              {result.tls.handshakeOk
                ? t("networkProbe.probe.tlsOk")
                : t("networkProbe.probe.tlsFail")}
            </div>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
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
          <div>
            {t("networkProbe.globalping.httpStatus", {
              status:
                remoteResult.measurementStatus === "finished"
                  ? (remoteResult.statusCode ?? "—")
                  : t(
                      `networkProbe.globalping.measurementStatus.${remoteResult.measurementStatus === "failed" || remoteResult.measurementStatus === "offline" ? remoteResult.measurementStatus : "unknown"}`,
                    ),
            })}
          </div>
          {remoteResult.ttfbMs != null ? (
            <div>
              {t("networkProbe.globalping.httpTtfb", {
                ms: remoteResult.ttfbMs.toFixed(0),
              })}
            </div>
          ) : null}
          {remoteResult.resolvedAddress ? (
            <div>
              {t("networkProbe.globalping.resolvedAddress")}:{" "}
              <span className="font-mono">{remoteResult.resolvedAddress}</span>
            </div>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{remoteResult.target}</div>
          <div className="text-muted-foreground font-mono text-xs">{remoteResult.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

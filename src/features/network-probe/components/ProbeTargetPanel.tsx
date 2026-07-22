/**
 * Feature UI / 功能界面: custom host/URL probe panel.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { ProbeTargetResult } from "@/lib/tauri/types/network-probe"

interface ProbeTargetPanelProps {
  loading: boolean
  result: ProbeTargetResult | null
  onRun: (input: string) => void
}

export function ProbeTargetPanel({ loading, result, onRun }: ProbeTargetPanelProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState("https://example.com")

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.probe.hint")}</p>
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
            <CommandHint hint={t("networkProbe.cmd.probeTarget", { input: input.trim() || "…" })}>
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
                : t("networkProbe.probe.httpFail", {
                    error: result.http.error ?? "—",
                  })}
              {result.http.finalUrl ? (
                <div className="text-muted-foreground font-mono text-xs">
                  {result.http.finalUrl}
                </div>
              ) : null}
            </div>
          ) : null}
          {result.tls ? (
            <div>
              {t("networkProbe.probe.tls")}:{" "}
              {result.tls.handshakeOk
                ? t("networkProbe.probe.tlsOk")
                : t("networkProbe.probe.tlsFail", {
                    detail: result.tls.detail ?? "—",
                  })}
            </div>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

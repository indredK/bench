/**
 * Feature UI / 功能界面: custom host/URL probe panel.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbeSystemDetails } from "@/features/network-probe/components/ProbeSystemDetails"
import { ProbeEmptyState } from "@/features/network-probe/components/ProbeEmptyState"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import {
  getPingSampleErrorKey,
  isKnownPingSampleError,
} from "@/features/network-probe/ping-sample-error"
import type { ProbeTargetResult } from "@/lib/tauri/types/network-probe"

interface ProbeTargetPanelProps {
  loading: boolean
  result: ProbeTargetResult | null
  hasError?: boolean
  onRun: (input: string) => void
}

export function ProbeTargetPanel({
  loading,
  result,
  hasError = false,
  onRun,
}: ProbeTargetPanelProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState("https://example.com")
  const hasSystemDetails = Boolean(
    (result?.icmp?.error && !isKnownPingSampleError(result.icmp.error)) ||
    result?.http?.error ||
    (!result?.tls?.handshakeOk && result?.tls?.detail),
  )
  const resultKindKey =
    result?.kind === "host"
      ? "networkProbe.probe.kindValues.host"
      : result?.kind === "url"
        ? "networkProbe.probe.kindValues.url"
        : "networkProbe.probe.kindValues.unknown"

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
      {!loading && !result && !hasError ? (
        <ProbeEmptyState>{t("networkProbe.resultEmpty")}</ProbeEmptyState>
      ) : null}
      {result ? (
        <div className="bg-muted/40 space-y-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.probe.kind")}: <span className="font-medium">{t(resultKindKey)}</span>
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
                    error: t(getPingSampleErrorKey(result.icmp.error)),
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
                  ? t("networkProbe.probe.httpStatusFail", { status: result.http.status })
                  : t("networkProbe.probe.httpRequestFail")}
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
                : t("networkProbe.probe.tlsFail")}
            </div>
          ) : null}
          {hasSystemDetails ? (
            <ProbeSystemDetails>
              <div className="space-y-1">
                {result.icmp?.error && !isKnownPingSampleError(result.icmp.error) ? (
                  <p>
                    <span className="text-muted-foreground">{t("networkProbe.probe.icmp")}: </span>
                    <span className="font-mono break-all" dir="ltr">
                      {result.icmp.error}
                    </span>
                  </p>
                ) : null}
                {result.http?.error ? (
                  <p>
                    <span className="text-muted-foreground">{t("networkProbe.probe.http")}: </span>
                    <span className="font-mono break-all" dir="ltr">
                      {result.http.error}
                    </span>
                  </p>
                ) : null}
                {!result.tls?.handshakeOk && result.tls?.detail ? (
                  <p>
                    <span className="text-muted-foreground">{t("networkProbe.probe.tls")}: </span>
                    <span className="font-mono break-all" dir="ltr">
                      {result.tls.detail}
                    </span>
                  </p>
                ) : null}
              </div>
            </ProbeSystemDetails>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

/**
 * Feature UI / 功能界面: TCP connect panel for test L1.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbeEmptyState } from "@/features/network-probe/components/ProbeEmptyState"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { parseBoundedIntegerInput } from "@/features/network-probe/integer-input"
import type { TcpConnectResult } from "@/lib/tauri/types/network-probe"

const TCP_STATUS_KEYS = {
  ok: "networkProbe.tcp.statusValue.ok",
  refused: "networkProbe.tcp.statusValue.refused",
  unreachable: "networkProbe.tcp.statusValue.unreachable",
  dns_failed: "networkProbe.tcp.statusValue.dnsFailed",
  timeout: "networkProbe.tcp.statusValue.timeout",
  error: "networkProbe.tcp.statusValue.error",
} as const

interface TcpConnectPanelProps {
  loading: boolean
  result: TcpConnectResult | null
  hasError?: boolean
  onRun: (host: string, port: number) => void
}

export function TcpConnectPanel({
  loading,
  result,
  hasError = false,
  onRun,
}: TcpConnectPanelProps) {
  const { t } = useTranslation()
  const [host, setHost] = useState("1.1.1.1")
  const [port, setPort] = useState("443")
  const parsedPort = parseBoundedIntegerInput(port, 1, 65535)
  const portError = parsedPort == null
  const statusKey = result
    ? TCP_STATUS_KEYS[result.status as keyof typeof TCP_STATUS_KEYS]
    : undefined

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.tcp.hint")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-tcp-host">
                {t("networkProbe.tcp.host")}
              </label>
              <Input
                id="np-tcp-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="w-28 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-tcp-port">
                {t("networkProbe.tcp.port")}
              </label>
              <Input
                id="np-tcp-port"
                type="number"
                min={1}
                max={65535}
                step={1}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                autoComplete="off"
                aria-invalid={portError}
                aria-describedby={portError ? "np-tcp-port-error" : undefined}
              />
              {portError ? (
                <p id="np-tcp-port-error" className="text-destructive text-xs" role="alert">
                  {t("networkProbe.tcp.portInvalid")}
                </p>
              ) : null}
            </div>
            <CommandHint
              hint={t("networkProbe.cmd.tcpConnect", {
                host: host.trim() || "…",
                port: port || "…",
              })}
            >
              <Button
                type="button"
                disabled={loading || !host.trim() || parsedPort == null}
                onClick={() => {
                  if (parsedPort != null) onRun(host, parsedPort)
                }}
              >
                {loading ? t("networkProbe.tcp.running") : t("networkProbe.tcp.run")}
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
        <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.tcp.status")}:{" "}
            <span className="font-medium">
              {t(statusKey ?? "networkProbe.tcp.statusValue.unknown")}
            </span>
          </div>
          {result.rttMs != null ? (
            <div>{t("networkProbe.tcp.rttValue", { ms: result.rttMs.toFixed(1) })}</div>
          ) : null}
          {result.message ? (
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer">
                {t("networkProbe.tcp.systemDetail")}
              </summary>
              <p className="text-muted-foreground mt-1 font-mono break-all" dir="ltr">
                {result.message}
              </p>
            </details>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

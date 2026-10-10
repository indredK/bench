/**
 * Feature UI / 功能界面: TCP connect panel for test L1.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { formatTcpConnectCommand } from "@/features/network-probe/utils/tcp-command"
import type { TcpConnectResult, TcpConnectStatus } from "@/lib/tauri/types/network-probe"

const TCP_STATUS_LABELS: Record<TcpConnectStatus, string> = {
  ok: "networkProbe.tcp.statusValue.ok",
  timeout: "networkProbe.tcp.statusValue.timeout",
  refused: "networkProbe.tcp.statusValue.refused",
  unreachable: "networkProbe.tcp.statusValue.unreachable",
  dns_failed: "networkProbe.tcp.statusValue.dnsFailed",
  error: "networkProbe.tcp.statusValue.error",
}

interface TcpConnectPanelProps {
  loading: boolean
  result: TcpConnectResult | null
  onRun: (host: string, port: number) => void
}

export function TcpConnectPanel({ loading, result, onRun }: TcpConnectPanelProps) {
  const { t } = useTranslation()
  const [host, setHost] = useState("1.1.1.1")
  const [port, setPort] = useState("443")
  const parsedPort = Number(port.trim())
  const portValid =
    /^\d+$/.test(port.trim()) &&
    Number.isInteger(parsedPort) &&
    parsedPort >= 1 &&
    parsedPort <= 65535
  const portInvalid = Boolean(port.trim()) && !portValid

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
            <div className="w-40 space-y-1">
              <label className="text-xs font-medium" htmlFor="np-tcp-port">
                {t("networkProbe.tcp.port")}
              </label>
              <Input
                id="np-tcp-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                aria-describedby="np-tcp-port-hint"
                aria-invalid={Boolean(port.trim()) && !portValid}
              />
              <p
                id="np-tcp-port-hint"
                className={
                  portInvalid ? "text-destructive text-xs" : "text-muted-foreground text-xs"
                }
              >
                {t(portInvalid ? "networkProbe.tcp.portInvalid" : "networkProbe.tcp.portHint")}
              </p>
            </div>
            <CommandHint hint={formatTcpConnectCommand(host, portValid ? parsedPort : Number.NaN)}>
              <Button
                type="button"
                disabled={loading || !host.trim() || !portValid}
                onClick={() => onRun(host, parsedPort)}
              >
                {loading ? t("networkProbe.tcp.running") : t("networkProbe.tcp.run")}
              </Button>
            </CommandHint>
          </div>
        </>
      }
    >
      {result ? (
        <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.tcp.status")}:{" "}
            <span className="font-medium">
              {t(TCP_STATUS_LABELS[result.status] ?? "networkProbe.tcp.statusValue.unknown")}
            </span>
          </div>
          {result.rttMs != null ? (
            <div>{t("networkProbe.tcp.rttValue", { ms: result.rttMs.toFixed(1) })}</div>
          ) : null}
          {result.message ? (
            <details className="text-muted-foreground text-xs">
              <summary className="cursor-pointer select-none">
                {t("networkProbe.tcp.technicalDetails")}
              </summary>
              <p className="mt-1 break-words">{result.message}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

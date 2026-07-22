/**
 * Feature UI / 功能界面: TCP connect panel for test L1.
 */
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { TcpConnectResult } from "@/lib/tauri/types/network-probe"

interface TcpConnectPanelProps {
  loading: boolean
  result: TcpConnectResult | null
  onRun: (host: string, port: number) => void
}

export function TcpConnectPanel({ loading, result, onRun }: TcpConnectPanelProps) {
  const { t } = useTranslation()
  const [host, setHost] = useState("1.1.1.1")
  const [port, setPort] = useState("443")

  return (
    <div className="space-y-4">
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
            value={port}
            onChange={(e) => setPort(e.target.value)}
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <CommandHint
          hint={t("networkProbe.cmd.tcpConnect", {
            host: host.trim() || "…",
            port: port || "…",
          })}
        >
          <Button
            type="button"
            disabled={loading || !host.trim() || !Number(port)}
            onClick={() => onRun(host, Number(port))}
          >
            {loading ? t("networkProbe.tcp.running") : t("networkProbe.tcp.run")}
          </Button>
        </CommandHint>
      </div>
      {result ? (
        <div className="bg-muted/40 space-y-1 rounded-lg border px-3 py-2 text-sm">
          <div>
            {t("networkProbe.tcp.status")}: <span className="font-medium">{result.status}</span>
          </div>
          {result.rttMs != null ? (
            <div>{t("networkProbe.tcp.rttValue", { ms: result.rttMs.toFixed(1) })}</div>
          ) : null}
          {result.message ? <div className="text-muted-foreground">{result.message}</div> : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Feature UI / 功能界面: mDNS + SSDP browse (read-only).
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { ProbeSystemDetails } from "@/features/network-probe/components/ProbeSystemDetails"
import type { LanServicesResult } from "@/lib/tauri/types/network-probe"

interface LanServicesPanelProps {
  loading: boolean
  result: LanServicesResult | null
  toolEnabled: boolean
  toolStatus?: string
  onRun: () => void
}

export function LanServicesPanel({
  loading,
  result,
  toolEnabled,
  toolStatus,
  onRun,
}: LanServicesPanelProps) {
  const { t } = useTranslation()
  const protocolLabel = (protocol: string) => {
    switch (protocol) {
      case "mdns":
        return t("networkProbe.lanSvc.protocol.mdns")
      case "ssdp":
        return t("networkProbe.lanSvc.protocol.ssdp")
      default:
        return t("networkProbe.lanSvc.protocol.unknown")
    }
  }
  const isProtocolError = (item: LanServicesResult["items"][number]) =>
    (item.protocol === "mdns" || item.protocol === "ssdp") && !item.serviceType && !item.host

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.lanSvc.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "lanServices",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.lanSvc.readOnlyHint")}
            </p>
          )}
          <CommandHint hint={t("networkProbe.cmd.lanSvc")}>
            <Button type="button" disabled={loading || !toolEnabled} onClick={onRun}>
              {loading ? t("networkProbe.lanSvc.running") : t("networkProbe.lanSvc.run")}
            </Button>
          </CommandHint>
        </>
      }
    >
      {result ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.lanSvc.meta", {
              count: result.items.length,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          {result.items.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("networkProbe.lanSvc.empty")}</p>
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {result.items.map((it, idx) => {
                const protocol = protocolLabel(it.protocol)
                return (
                  <li key={`${it.protocol}-${it.name}-${idx}`}>
                    [{protocol}]{" "}
                    {isProtocolError(it)
                      ? t("networkProbe.lanSvc.protocolError", { protocol })
                      : it.name}
                    {it.serviceType ? ` · ${it.serviceType}` : ""}
                    {it.host ? ` · ${it.host}` : ""}
                    {it.port ? `:${it.port}` : ""}
                  </li>
                )
              })}
            </ul>
          )}
          {result.items.some((item) => item.detail) ? (
            <ProbeSystemDetails>
              <ul className="space-y-1">
                {result.items.map((item, idx) =>
                  item.detail ? (
                    <li key={`${item.protocol}-${item.name}-${idx}`}>
                      <span className="font-medium">{protocolLabel(item.protocol)}</span>:{" "}
                      <span className="font-mono break-all">{item.detail}</span>
                    </li>
                  ) : null,
                )}
              </ul>
            </ProbeSystemDetails>
          ) : null}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

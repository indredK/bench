/**
 * Feature UI / 功能界面: LAN ARP-cache + TCP sweep discovery (degraded).
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { OpenSystemNetworkSettingsButton } from "@/features/network-probe/components/OpenSystemNetworkSettingsButton"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { ScanCancelButton } from "@/features/network-probe/components/ScanCancelButton"
import type { LanDiscoveryResult } from "@/lib/tauri/types/network-probe"

function arpSourceKey(source: string) {
  switch (source) {
    case "arp-cache":
      return "networkProbe.arp.sourceCache"
    case "tcp-sweep":
      return "networkProbe.arp.sourceTcpSweep"
    default:
      return "networkProbe.arp.sourceUnknown"
  }
}

interface ArpPanelProps {
  loading: boolean
  result: LanDiscoveryResult | null
  toolEnabled: boolean
  toolStatus?: string
  canCancel?: boolean
  cancelRequested?: boolean
  openingSettings?: boolean
  onRun: () => void
  onCancel?: () => void
  onOpenSettings?: () => void
}

export function ArpPanel({
  loading,
  result,
  toolEnabled,
  toolStatus,
  canCancel,
  cancelRequested = false,
  openingSettings = false,
  onRun,
  onCancel,
  onOpenSettings,
}: ArpPanelProps) {
  const { t } = useTranslation()
  const emptyKey =
    result?.emptyReason === "permission"
      ? "networkProbe.arp.emptyPermission"
      : result?.emptyReason === "isolation"
        ? "networkProbe.arp.emptyIsolation"
        : result?.emptyReason === "quiet"
          ? "networkProbe.arp.emptyQuiet"
          : "networkProbe.arp.empty"

  return (
    <ProbePanelShell
      toolbar={
        <>
          <p className="text-muted-foreground text-sm">{t("networkProbe.arp.hint")}</p>
          {!toolEnabled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.caps.toolDisabled", {
                tool: "arp",
                status: toolStatus ?? "unsupported",
              })}
            </p>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.arp.degradedHint")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <CommandHint hint={t("networkProbe.cmd.arp")}>
              <Button type="button" disabled={loading || !toolEnabled} onClick={onRun}>
                {loading ? t("networkProbe.arp.running") : t("networkProbe.arp.run")}
              </Button>
            </CommandHint>
            {canCancel && onCancel ? (
              <ScanCancelButton
                label={t("common.cancel")}
                cancelRequested={cancelRequested}
                onCancel={onCancel}
              />
            ) : null}
            {onOpenSettings ? (
              <OpenSystemNetworkSettingsButton
                opening={openingSettings}
                label={t("networkProbe.arp.openSettings")}
                onOpen={onOpenSettings}
              />
            ) : null}
          </div>
        </>
      }
    >
      {result ? (
        <div className="space-y-2">
          {result.cidr ? (
            <p className="text-muted-foreground font-mono text-xs">
              {t("networkProbe.arp.cidr", { cidr: result.cidr })}
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.arp.meta", {
              count: result.neighbors.length,
              mode: result.mode,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          {result.cancelled ? (
            <div role="status" className="text-sm text-amber-700 dark:text-amber-400">
              <p>{t("networkProbe.arp.cancelled")}</p>
              <p className="text-xs">
                {result.neighbors.length > 0
                  ? t("networkProbe.arp.cancelledPartial", {
                      count: result.neighbors.length,
                    })
                  : t("networkProbe.arp.cancelledEmpty")}
              </p>
            </div>
          ) : null}
          {result.neighbors.length === 0 ? (
            result.cancelled ? null : (
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">{t(emptyKey)}</p>
                {result.emptyReason === "permission" && onOpenSettings ? (
                  <OpenSystemNetworkSettingsButton
                    opening={openingSettings}
                    label={t("networkProbe.arp.openSettings")}
                    onOpen={onOpenSettings}
                    size="sm"
                  />
                ) : null}
              </div>
            )
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {result.neighbors.map((n) => (
                <li key={n.ip}>
                  {n.ip}
                  {n.mac
                    ? ` · ${n.mac}`
                    : n.source === "arp-cache"
                      ? ` · ${t("networkProbe.arp.macUnresolved")}`
                      : ""}
                  {n.iface ? ` · ${n.iface}` : ""}
                  {` · ${t(arpSourceKey(n.source))}`}
                </li>
              ))}
            </ul>
          )}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

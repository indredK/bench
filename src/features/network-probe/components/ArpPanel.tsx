/**
 * Feature UI / 功能界面: LAN ARP-cache + TCP sweep discovery (degraded).
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { VirtualList } from "@/components/content/VirtualList"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { ArpNeighbor, LanDiscoveryResult } from "@/lib/tauri/types/network-probe"

function formatNeighbor(neighbor: ArpNeighbor, incompleteLabel: string): string {
  return `${neighbor.ip}${neighbor.mac ? ` · ${neighbor.mac}` : ` · ${incompleteLabel}`}${neighbor.iface ? ` · ${neighbor.iface}` : ""}${neighbor.source ? ` · ${neighbor.source}` : ""}`
}

interface ArpPanelProps {
  loading: boolean
  result: LanDiscoveryResult | null
  toolEnabled: boolean
  toolStatus?: string
  canCancel?: boolean
  onRun: () => void
  onCancel?: () => void
  onOpenSettings?: () => void
  openingSettings?: boolean
}

export function ArpPanel({
  loading,
  result,
  toolEnabled,
  toolStatus,
  canCancel,
  onRun,
  onCancel,
  onOpenSettings,
  openingSettings = false,
}: ArpPanelProps) {
  const { t } = useTranslation()
  const incompleteLabel = t("networkProbe.arp.incomplete")
  const renderNeighbor = (neighbor: ArpNeighbor) => formatNeighbor(neighbor, incompleteLabel)
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
              <CommandHint hint={t("networkProbe.cmd.cancelScan")}>
                <Button type="button" variant="outline" onClick={onCancel}>
                  {t("common.cancel")}
                </Button>
              </CommandHint>
            ) : null}
            {onOpenSettings ? (
              <Button
                type="button"
                variant="outline"
                disabled={openingSettings}
                onClick={onOpenSettings}
              >
                {openingSettings
                  ? t("networkProbe.openingSettings")
                  : t("networkProbe.arp.openSettings")}
              </Button>
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
          {result.message ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">{result.message}</p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {t("networkProbe.arp.meta", {
              count: result.neighbors.length,
              mode: result.mode,
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          {result.neighbors.length === 0 ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">{t(emptyKey)}</p>
              {result.cancelled ? (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("networkProbe.arp.cancelled")}
                </p>
              ) : null}
              {result.emptyReason === "permission" && onOpenSettings ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={openingSettings}
                  onClick={onOpenSettings}
                >
                  {openingSettings
                    ? t("networkProbe.openingSettings")
                    : t("networkProbe.arp.openSettings")}
                </Button>
              ) : null}
            </div>
          ) : (
            <VirtualList
              items={result.neighbors}
              getItemKey={(neighbor) => neighbor.ip}
              getItemLabel={renderNeighbor}
              renderItem={renderNeighbor}
              className="font-mono text-xs"
            />
          )}
          <div className="text-muted-foreground font-mono text-xs">{result.commandHint}</div>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

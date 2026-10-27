/**
 * Feature UI / 功能界面: LAN neighbor cache + bounded TCP connect discovery.
 */
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { NetworkProbeCancelButton } from "@/features/network-probe/components/NetworkProbeCancelButton"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { VirtualizedResultList } from "@/features/network-probe/components/VirtualizedResultList"
import type { LanDiscoveryProgressEvent, LanDiscoveryResult } from "@/lib/tauri/types/network-probe"

interface ArpPanelProps {
  loading: boolean
  result: LanDiscoveryResult | null
  progress?: LanDiscoveryProgressEvent | null
  toolEnabled: boolean
  toolStatus?: string
  canCancel?: boolean
  cancelling: boolean
  onRun: () => void
  onCancel?: () => void
  onOpenSettings?: () => void
  onOpenPrivacySettings?: () => void
}

export function ArpPanel({
  loading,
  result,
  progress,
  toolEnabled,
  toolStatus,
  canCancel,
  cancelling,
  onRun,
  onCancel,
  onOpenSettings,
  onOpenPrivacySettings,
}: ArpPanelProps) {
  const { t } = useTranslation()
  const statusKeys: Record<string, string> = {
    permission: "networkProbe.arp.emptyPermission",
    isolation: "networkProbe.arp.emptyIsolation",
    quiet: "networkProbe.arp.emptyQuiet",
    scope: "networkProbe.arp.scopeSkipped",
    "non-private-scope": "networkProbe.arp.nonPrivateScopeSkipped",
    "no-peers": "networkProbe.arp.noPeers",
    "no-interface": "networkProbe.arp.noInterface",
  }
  const noCacheStatusKeys: Record<string, string> = {
    scope: "networkProbe.arp.scopeSkippedNoCache",
    "non-private-scope": "networkProbe.arp.nonPrivateScopeSkippedNoCache",
    "no-peers": "networkProbe.arp.noPeersNoCache",
  }
  const modeKeys: Record<string, string> = {
    "arp-cache": "networkProbe.arp.mode.cache",
    "arp-cache+tcp-sweep": "networkProbe.arp.mode.cacheAndTcp",
    "tcp-sweep": "networkProbe.arp.mode.tcpOnly",
    "not-run": "networkProbe.arp.mode.notRun",
  }
  const sourceKeys: Record<string, string> = {
    "arp-cache": "networkProbe.arp.source.cache",
    "tcp-sweep": "networkProbe.arp.source.tcpSweep",
  }
  const statusKey =
    (result?.mode === "not-run" ? noCacheStatusKeys[result.emptyReason ?? ""] : undefined) ??
    statusKeys[result?.emptyReason ?? ""]
  const totalHosts = Math.max(0, progress?.totalHosts ?? 0)
  const checkedHosts = Math.min(totalHosts, Math.max(0, progress?.checkedHosts ?? 0))
  const progressText =
    progress?.phase === "preparing"
      ? t("networkProbe.arp.preparing")
      : t("networkProbe.arp.progress", {
          checked: checkedHosts,
          total: totalHosts,
          count: Math.max(0, progress?.discoveredNeighbors ?? 0),
        })

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
              <NetworkProbeCancelButton
                label={t("common.cancel")}
                cancelling={cancelling}
                onCancel={onCancel}
              />
            ) : null}
            {onOpenSettings ? (
              <Button type="button" variant="outline" onClick={onOpenSettings}>
                {t("networkProbe.arp.openSettings")}
              </Button>
            ) : null}
          </div>
        </>
      }
    >
      {loading && progress ? (
        <div className="max-w-xl space-y-1.5">
          <p className="text-muted-foreground text-xs" aria-live="polite" aria-atomic="true">
            {progressText}
          </p>
          {progress.phase === "scanning" && totalHosts > 0 ? (
            <div
              className="bg-muted h-1.5 overflow-hidden rounded-full"
              role="progressbar"
              aria-label={t("networkProbe.arp.progressLabel")}
              aria-valuemin={0}
              aria-valuemax={totalHosts}
              aria-valuenow={checkedHosts}
              aria-valuetext={progressText}
            >
              <div
                className="bg-primary h-full transition-[width] duration-150"
                style={{ width: `${(checkedHosts / totalHosts) * 100}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
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
              mode: t(modeKeys[result.mode] ?? "networkProbe.arp.mode.unknown"),
              ms: result.elapsedMs.toFixed(0),
            })}
          </p>
          {statusKey ? <p className="text-muted-foreground text-sm">{t(statusKey)}</p> : null}
          {result.emptyReason === "permission" && onOpenPrivacySettings ? (
            <Button type="button" variant="outline" size="sm" onClick={onOpenPrivacySettings}>
              {t("networkProbe.ping.openPrivacySettings")}
            </Button>
          ) : null}
          {result.cancelled ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("networkProbe.arp.cancelled")}
            </p>
          ) : null}
          {result.neighbors.length === 0 ? (
            <div className="space-y-2">
              {!statusKey && !result.cancelled ? (
                <p className="text-muted-foreground text-sm">{t("networkProbe.arp.empty")}</p>
              ) : null}
            </div>
          ) : (
            <VirtualizedResultList
              ariaLabel={t("networkProbe.arp.resultsLabel")}
              className="font-mono text-xs"
              items={result.neighbors}
              getItemKey={(neighbor) => neighbor.ip}
              renderItem={(n) => (
                <>
                  {n.ip}
                  {n.mac ? ` · ${n.mac}` : " · (incomplete)"}
                  {n.iface ? ` · ${n.iface}` : ""}
                  {n.source
                    ? ` · ${t(sourceKeys[n.source] ?? "networkProbe.arp.source.unknown")}`
                    : ""}
                </>
              )}
            />
          )}
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer">
              {t("networkProbe.arp.commandDetails")}
            </summary>
            <div className="text-muted-foreground mt-1 font-mono" dir="auto">
              {result.commandHint}
            </div>
          </details>
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

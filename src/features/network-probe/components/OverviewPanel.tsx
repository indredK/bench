/**
 * Feature UI / 功能界面: overview panel for basic L1.
 */
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { CommandHint } from "@/components/common/CommandHint"
import { Button } from "@/components/ui/button"
import { OpenSystemNetworkSettingsButton } from "@/features/network-probe/components/OpenSystemNetworkSettingsButton"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import type { NetworkProbeOverviewErrors } from "@/features/network-probe/store"
import { cn } from "@/lib/utils"

interface OverviewPanelProps {
  loading: boolean
  summary: {
    primaryIpv4?: string
    primaryIpv6?: string
    gateway?: string
    dnsServers: string[]
    wifiSsid?: string
    wifiSignalDbm?: number
    interfaces: { name: string; addrs: string[]; isLoopback: boolean }[]
  } | null
  firewall: { status: string; detail?: string } | null
  errors: NetworkProbeOverviewErrors
  hostsSuspiciousCount: number
  openingSettings: boolean
  onRefresh: () => void
  onOpenSettings: () => void
  embedded?: boolean
}

export function OverviewPanel({
  loading,
  summary,
  firewall,
  errors,
  hostsSuspiciousCount,
  openingSettings,
  onRefresh,
  onOpenSettings,
  embedded = false,
}: OverviewPanelProps) {
  const { t } = useTranslation()
  const initialRefreshAttempted = useRef(false)

  useEffect(() => {
    if (!summary && !loading && !errors.summary) onRefresh()
  }, [summary, loading, errors.summary, onRefresh])

  return (
    <ProbePanelShell
      embedded={embedded}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <CommandHint hint={t("networkProbe.cmd.summary")}>
            <Button type="button" size="sm" onClick={onRefresh} disabled={loading}>
              {loading ? t("networkProbe.overview.refreshing") : t("networkProbe.overview.refresh")}
            </Button>
          </CommandHint>
          <CommandHint hint={t("networkProbe.cmd.openSettings")}>
            <Button type="button" size="sm" variant="outline" onClick={onOpenSettings}>
              {t("networkProbe.overview.openSettings")}
            </Button>
          </CommandHint>
          <span className="text-muted-foreground font-mono text-xs">
            {t("networkProbe.cmd.summary")}
          </span>
        </div>
      }
    >
      {errors.summary ? (
        <p role="alert" className="text-destructive text-xs">
          {t("networkProbe.overview.refreshFailed", { message: errors.summary })}
        </p>
      ) : null}
      {!summary && !loading ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.overview.empty")}</p>
      ) : null}

      {summary ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard label={t("networkProbe.overview.ipv4")} value={summary.primaryIpv4 ?? "—"} />
          <InfoCard label={t("networkProbe.overview.ipv6")} value={summary.primaryIpv6 ?? "—"} />
          <InfoCard label={t("networkProbe.overview.gateway")} value={summary.gateway ?? "—"} />
          <InfoCard
            label={t("networkProbe.overview.dns")}
            value={summary.dnsServers.length ? summary.dnsServers.join(", ") : "—"}
          />
          <InfoCard
            label={t("networkProbe.overview.wifi")}
            value={formatWifiSummary(summary.wifiSsid, summary.wifiSignalDbm)}
          />
          <InfoCard
            label={t("networkProbe.overview.firewall")}
            error={
              errors.firewall
                ? t("networkProbe.overview.refreshFailed", { message: errors.firewall })
                : undefined
            }
            value={
              firewall
                ? hasOwnTranslationKey(`networkProbe.firewall.${firewall.status}`)
                  ? t(`networkProbe.firewall.${firewall.status}`)
                  : t("networkProbe.firewall.unknown")
                : "—"
            }
          />
          <InfoCard
            label={t("networkProbe.overview.hosts")}
            error={
              errors.hosts
                ? t("networkProbe.overview.refreshFailed", { message: errors.hosts })
                : undefined
            }
            value={t("networkProbe.overview.hostsCount", { count: hostsSuspiciousCount })}
          />
          <InfoCard
            label={t("networkProbe.overview.ifaces")}
            value={String(summary.interfaces.filter((i) => !i.isLoopback).length)}
          />
        </div>
      ) : null}
    </ProbePanelShell>
  )
}

function formatWifiSummary(ssid?: string, signalDbm?: number) {
  const normalizedSsid = ssid?.trim()
  if (!normalizedSsid) return signalDbm != null ? `${signalDbm} dBm` : "—"
  return `${normalizedSsid}${signalDbm != null ? ` (${signalDbm} dBm)` : ""}`
}

function InfoCard({ label, value, error }: { label: string; value: string; error?: string }) {
  return (
    <div className={cn("bg-muted/30 rounded-md border px-2.5 py-2")}>
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <div
        className={cn("mt-1 text-sm font-medium break-all", error && "text-destructive")}
        role={error ? "alert" : undefined}
      >
        {error ?? value}
      </div>
    </div>
  )
}

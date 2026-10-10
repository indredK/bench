/**
 * Feature UI / 功能界面: overview panel for basic L1.
 */
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { OpenSystemNetworkSettingsButton } from "@/features/network-probe/components/OpenSystemNetworkSettingsButton"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { hasOwnTranslationKey } from "@/features/network-probe/utils/translation-key"
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
  hostsSuspiciousCount: number
  openingSettings: boolean
  onRefresh: () => void
  onOpenSettings: () => void
}

export function OverviewPanel({
  loading,
  summary,
  firewall,
  hostsSuspiciousCount,
  openingSettings,
  onRefresh,
  onOpenSettings,
}: OverviewPanelProps) {
  const { t } = useTranslation()
  const initialRefreshAttempted = useRef(false)

  useEffect(() => {
    if (!summary && !loading && !initialRefreshAttempted.current) {
      initialRefreshAttempted.current = true
      onRefresh()
    }
  }, [summary, loading, onRefresh])

  return (
    <ProbePanelShell
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={onRefresh} disabled={loading}>
            {loading ? t("networkProbe.overview.refreshing") : t("networkProbe.overview.refresh")}
          </Button>
          <OpenSystemNetworkSettingsButton
            opening={openingSettings}
            label={t("networkProbe.overview.openSettings")}
            onOpen={onOpenSettings}
            size="sm"
          />
          <span className="text-muted-foreground font-mono text-xs">
            {t("networkProbe.cmd.summary")}
          </span>
        </div>
      }
    >
      {!summary && loading ? <OverviewSkeleton /> : null}

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
            value={
              summary.wifiSsid
                ? `${summary.wifiSsid}${
                    summary.wifiSignalDbm != null ? ` (${summary.wifiSignalDbm} dBm)` : ""
                  }`
                : "—"
            }
          />
          <InfoCard
            label={t("networkProbe.overview.firewall")}
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

function OverviewSkeleton() {
  const { t } = useTranslation()

  return (
    <div
      role="status"
      aria-label={t("networkProbe.overview.refreshing")}
      aria-busy="true"
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          data-testid="overview-loading-skeleton"
          aria-hidden="true"
          className="bg-muted/30 rounded-md border px-2.5 py-2"
        >
          <div className="bg-muted h-3 w-14 animate-pulse rounded" />
          <div className="bg-muted mt-2 h-4 w-4/5 animate-pulse rounded" />
        </div>
      ))}
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("bg-muted/30 rounded-md border px-2.5 py-2")}>
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium break-all">{value}</div>
    </div>
  )
}

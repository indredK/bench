/**
 * Feature UI / 功能界面: overview panel for basic L1.
 */
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
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
  onRefresh: () => void
  onOpenSettings: () => void
}

export function OverviewPanel({
  loading,
  summary,
  firewall,
  hostsSuspiciousCount,
  onRefresh,
  onOpenSettings,
}: OverviewPanelProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!summary && !loading) onRefresh()
  }, [summary, loading, onRefresh])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={onRefresh} disabled={loading}>
          {loading ? t("networkProbe.overview.refreshing") : t("networkProbe.overview.refresh")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onOpenSettings}>
          {t("networkProbe.overview.openSettings")}
        </Button>
        <span className="text-muted-foreground font-mono text-xs">
          {t("networkProbe.cmd.summary")}
        </span>
      </div>

      {!summary && !loading ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.overview.empty")}</p>
      ) : null}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2">
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
                ? t(`networkProbe.firewall.${firewall.status}`, {
                    defaultValue: firewall.status,
                  })
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
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("bg-muted/40 rounded-lg border px-3 py-2")}>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-sm font-medium break-all">{value}</div>
    </div>
  )
}

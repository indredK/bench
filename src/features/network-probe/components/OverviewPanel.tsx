/**
 * Feature UI / 功能界面: overview panel for basic L1.
 */
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { CommandHint } from "@/components/common/CommandHint"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import { cn } from "@/lib/utils"
import type { NetworkSummaryField } from "@/lib/tauri/types/network-probe"

interface OverviewPanelProps {
  loading: boolean
  summary: {
    primaryIpv4?: string
    primaryIpv6?: string
    gateway?: string
    dnsServers: string[]
    wifiSsid?: string
    wifiSignalDbm?: number
    unavailableFields?: NetworkSummaryField[]
    interfaces: { name: string; addrs: string[]; isLoopback: boolean }[]
  } | null
  firewall: { status: string; detail?: string } | null
  hostsSuspiciousCount: number
  openingSettings: boolean
  onAutoLoadOverview: () => void
  onRefresh: () => void
  onOpenSettings: () => void
  embedded?: boolean
}

export function OverviewPanel({
  loading,
  summary,
  firewall,
  hostsSuspiciousCount,
  openingSettings,
  onAutoLoadOverview,
  onRefresh,
  onOpenSettings,
  embedded = false,
}: OverviewPanelProps) {
  const { t } = useTranslation()
  useEffect(() => {
    if (!summary && !loading) onAutoLoadOverview()
  }, [summary, loading, onAutoLoadOverview])

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
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={openingSettings}
            onClick={onOpenSettings}
          >
            {openingSettings
              ? t("networkProbe.overview.openingSettings")
              : t("networkProbe.overview.openSettings")}
          </Button>
        </div>
      }
    >
      {!summary && !loading ? (
        <p className="text-muted-foreground text-sm">{t("networkProbe.overview.empty")}</p>
      ) : null}

      {summary ? (
        <>
          {summary.unavailableFields?.length ? (
            <div
              role="status"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
            >
              <p className="text-sm font-medium">{t("networkProbe.overview.partialData")}</p>
              <ul className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
                {summary.unavailableFields.map((field) => (
                  <li key={field}>{t(`networkProbe.overview.unavailableFields.${field}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2">
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
        </>
      ) : null}
    </ProbePanelShell>
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

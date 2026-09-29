/** Feature UI / 功能界面: unified local network and health overview for basic L1. */
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  CircleX,
  LoaderCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProbePanelShell } from "@/features/network-probe/components/ProbePanelShell"
import {
  HEALTH_OVERVIEW_STATUSES,
  summarizeHealthOverview,
  type HealthOverviewState,
  type HealthOverviewStatus,
} from "@/features/network-probe/health-overview"
import type {
  HealthCheckItem,
  HealthScanResult,
  LocalNetworkSummary,
} from "@/lib/tauri/types/network-probe"
import { cn } from "@/lib/utils"

interface OverviewPanelProps {
  loading: boolean
  summary: LocalNetworkSummary | null
  firewall: { status: string; detail?: string } | null
  hostsSuspiciousCount: number
  onRefresh: () => void
  onOpenSettings: () => void
  openingSettings: boolean
  healthLoading: boolean
  healthResult: HealthScanResult | null
  healthStreamingItems: HealthCheckItem[]
  healthCanCancel: boolean
  onRunHealthScan: () => void
  onCancelHealthScan: () => void
  onGoTree: () => void
  onGoOpinion: () => void
  onGoOffline: () => void
}

export function OverviewPanel({
  loading,
  summary,
  firewall,
  hostsSuspiciousCount,
  onRefresh,
  onOpenSettings,
  openingSettings,
  healthLoading,
  healthResult,
  healthStreamingItems,
  healthCanCancel,
  onRunHealthScan,
  onCancelHealthScan,
  onGoTree,
  onGoOpinion,
  onGoOffline,
}: OverviewPanelProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!summary && !loading) onRefresh()
  }, [summary, loading, onRefresh])

  const health = summarizeHealthOverview(healthResult, healthLoading, healthStreamingItems)
  const opinions = healthLoading ? [] : (healthResult?.opinions ?? [])
  const visibleOpinions = opinions.slice(0, 2)
  const canShowAdvice = !healthLoading && healthResult !== null

  return (
    <ProbePanelShell
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground min-w-0 flex-1 text-sm">
            {t("networkProbe.overview.hint")}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {healthLoading ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!healthCanCancel}
                onClick={onCancelHealthScan}
              >
                {t("networkProbe.health.cancel")}
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={onRunHealthScan}>
                {t(healthResult ? "networkProbe.overview.rerunHealth" : "networkProbe.health.run")}
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={onGoOffline}>
              {t("networkProbe.l2.offline")}
            </Button>
            <Button type="button" size="sm" onClick={onRefresh} disabled={loading}>
              {loading ? t("networkProbe.overview.refreshing") : t("networkProbe.overview.refresh")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={openingSettings}
              onClick={onOpenSettings}
            >
              {openingSettings
                ? t("networkProbe.openingSettings")
                : t("networkProbe.overview.openSettings")}
            </Button>
          </div>
        </div>
      }
    >
      {!summary && !loading ? (
        <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-sm">
          {t("networkProbe.overview.empty")}
        </p>
      ) : null}

      <div className="grid items-start gap-3 2xl:grid-cols-2">
        <section
          className="min-w-0 space-y-3 rounded-lg border p-3"
          aria-labelledby="overview-local-title"
        >
          <div className="flex items-center gap-2">
            <Activity size={16} aria-hidden="true" className="text-muted-foreground" />
            <h2 id="overview-local-title" className="text-sm font-semibold">
              {t("networkProbe.overview.localTitle")}
            </h2>
            {loading ? (
              <span className="text-muted-foreground ml-auto text-xs" role="status">
                {t("networkProbe.overview.refreshing")}
              </span>
            ) : null}
          </div>
          {summary ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-2">
              <InfoCard
                label={t("networkProbe.overview.ipv4")}
                value={summary.primaryIpv4 ?? "—"}
              />
              <InfoCard
                label={t("networkProbe.overview.ipv6")}
                value={summary.primaryIpv6 ?? "—"}
              />
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
                value={String(summary.interfaces.filter((iface) => !iface.isLoopback).length)}
              />
            </div>
          ) : loading ? (
            <div
              className="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:grid-cols-2"
              aria-hidden="true"
            >
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="bg-muted/40 h-14 animate-pulse rounded-md" />
              ))}
            </div>
          ) : null}
        </section>

        <section
          className="min-w-0 space-y-3 rounded-lg border p-3"
          aria-labelledby="overview-health-title"
          aria-busy={healthLoading}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Activity size={16} aria-hidden="true" className="text-muted-foreground" />
            <h2 id="overview-health-title" className="text-sm font-semibold">
              {t("networkProbe.overview.healthTitle")}
            </h2>
            <HealthStateBadge state={health.state} />
            {healthResult && !healthLoading ? (
              <span className="text-muted-foreground ml-auto text-xs">
                {t("networkProbe.health.elapsed", { ms: healthResult.elapsedMs.toFixed(0) })}
              </span>
            ) : null}
          </div>

          <p className="text-muted-foreground text-xs" aria-live="polite">
            {healthLoading
              ? t("networkProbe.overview.healthProgress", { count: health.total })
              : health.state === "notRun"
                ? t("networkProbe.overview.healthEmpty")
                : t(`networkProbe.overview.healthState.${health.state}`)}
          </p>

          {health.total > 0 ? (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-2">
              {HEALTH_OVERVIEW_STATUSES.map((status) => (
                <HealthCount key={status} status={status} count={health.counts[status]} />
              ))}
              {health.unknownCount > 0 ? (
                <HealthCount
                  status="unknown"
                  count={health.unknownCount}
                  label={t("networkProbe.overview.unknown")}
                />
              ) : null}
            </dl>
          ) : null}

          {canShowAdvice ? (
            opinions.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {t("networkProbe.overview.nextSteps")}
                </h3>
                <ul className="space-y-2">
                  {visibleOpinions.map((opinion) => (
                    <li
                      key={opinion.id}
                      className={cn(
                        "rounded-md border px-2.5 py-2 text-xs",
                        opinion.severity === "critical" && "border-destructive/40 bg-destructive/5",
                        opinion.severity === "warn" && "border-amber-500/40 bg-amber-500/5",
                        opinion.severity === "info" && "bg-muted/40",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[10px] font-semibold uppercase">
                          {t(`networkProbe.opinion.severity.${opinion.severity}`, {
                            defaultValue: opinion.severity,
                          })}
                        </span>
                        <span className="font-medium">
                          {t(opinion.titleKey, { defaultValue: opinion.titleKey })}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1">
                        {t(opinion.bodyKey, { defaultValue: opinion.bodyKey })}
                      </p>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={onGoOpinion}
                >
                  {t("networkProbe.overview.allAdvice", { count: opinions.length })}
                  <ArrowRight size={14} aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground bg-muted/30 rounded-md px-2.5 py-2 text-xs">
                {t("networkProbe.opinion.none")}
              </p>
            )
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button type="button" size="sm" variant="outline" onClick={onGoTree}>
              {t("networkProbe.overview.viewTree")}
            </Button>
          </div>
        </section>
      </div>
    </ProbePanelShell>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 min-w-0 rounded-md border px-2.5 py-2">
      <div className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium break-all">{value}</div>
    </div>
  )
}

function HealthCount({
  status,
  count,
  label,
}: {
  status: HealthOverviewStatus | "unknown"
  count: number
  label?: string
}) {
  const { t } = useTranslation()
  const text = label ?? t(`networkProbe.health.status.${status}`)

  return (
    <div className="bg-muted/30 min-w-0 rounded-md border px-2 py-1.5">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            status === "pass" && "bg-emerald-600 dark:bg-emerald-400",
            status === "warn" && "bg-amber-600 dark:bg-amber-400",
            status === "fail" && "bg-destructive",
            status === "error" && "bg-destructive/70",
            (status === "skip" || status === "unknown") && "bg-muted-foreground",
          )}
        />
        <span className="truncate">{text}</span>
      </dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{count}</dd>
    </div>
  )
}

function HealthStateBadge({ state }: { state: HealthOverviewState }) {
  const { t } = useTranslation()
  const Icon =
    state === "scanning"
      ? LoaderCircle
      : state === "healthy"
        ? CheckCircle2
        : state === "issues"
          ? CircleX
          : state === "attention"
            ? AlertCircle
            : CircleDashed

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        state === "healthy" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
        state === "issues" && "border-destructive/30 bg-destructive/10 text-destructive",
        state === "attention" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
        (state === "partial" || state === "cancelled" || state === "notRun") &&
          "text-muted-foreground bg-muted/30",
        state === "scanning" && "border-primary/30 bg-primary/10 text-primary",
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        size={12}
        aria-hidden="true"
        className={state === "scanning" ? "animate-spin" : undefined}
      />
      {t(`networkProbe.overview.healthState.${state}`)}
    </span>
  )
}

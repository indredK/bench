/**
 * Page View / 页面视图: compose L1/L2 shell and panels; 只组合页面.
 */
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Network } from "lucide-react"
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate"
import { DnsLookupPanel } from "@/features/network-probe/components/DnsLookupPanel"
import { EgressPanel } from "@/features/network-probe/components/EgressPanel"
import { FixPanel } from "@/features/network-probe/components/FixPanel"
import { HealthTreePanel } from "@/features/network-probe/components/HealthTreePanel"
import { Ipv6Panel } from "@/features/network-probe/components/Ipv6Panel"
import { MtuPanel } from "@/features/network-probe/components/MtuPanel"
import { OfflinePanel } from "@/features/network-probe/components/OfflinePanel"
import { OverviewPanel } from "@/features/network-probe/components/OverviewPanel"
import { PingPanel } from "@/features/network-probe/components/PingPanel"
import { ProbeTargetPanel } from "@/features/network-probe/components/ProbeTargetPanel"
import { ReportPanel } from "@/features/network-probe/components/ReportPanel"
import { ScanOpinionPanel } from "@/features/network-probe/components/ScanOpinionPanel"
import { SitesProbePanel } from "@/features/network-probe/components/SitesProbePanel"
import { TcpConnectPanel } from "@/features/network-probe/components/TcpConnectPanel"
import { TraceroutePanel } from "@/features/network-probe/components/TraceroutePanel"
import { useNetworkProbeController } from "@/features/network-probe/hooks/useNetworkProbeController"
import {
  OFFLINE_SUBS,
  type NetworkProbeL1,
  type NetworkProbeOfflineSub,
} from "@/features/network-probe/store"
import { cn } from "@/lib/utils"
import type { FeatureDescriptor } from "@/platform/capabilities"

const L1_IDS: NetworkProbeL1[] = ["basic", "test", "security", "discover"]

const L2_BY_L1: Record<NetworkProbeL1, string[]> = {
  basic: ["overview", "tree", "opinion", "sites", "offline", "fix", "report"],
  test: ["ping", "dns", "tcp", "custom", "traceroute", "mtu", "egress", "speed"],
  security: ["ports", "pollution", "pcap", "dnssec", "whois"],
  discover: ["arp", "lan-svc", "nat", "ntp", "nodes"],
}

const POST_L2 = new Set([
  "speed",
  "ports",
  "pollution",
  "pcap",
  "dnssec",
  "whois",
  "arp",
  "lan-svc",
  "nat",
  "ntp",
  "nodes",
])

export default function NetworkProbePage({ feature }: { feature?: FeatureDescriptor }) {
  const { t } = useTranslation()
  const c = useNetworkProbeController()

  const l2Items = L2_BY_L1[c.l1Id]
  const hostsSuspicious = useMemo(
    () => (c.hosts ?? []).filter((h) => h.suspicious).length,
    [c.hosts],
  )
  const sitePackIds = useMemo(() => Object.keys(c.defaults?.sitePacks ?? {}), [c.defaults])

  const errorText = c.error ? t(c.error.key, { defaultValue: c.error.fallback }) : null

  const showOverview = c.l1Id === "basic" && c.l2Id === "overview"
  const showTree = c.l1Id === "basic" && c.l2Id === "tree"
  const showOpinion = c.l1Id === "basic" && c.l2Id === "opinion"
  const showSites = c.l1Id === "basic" && c.l2Id === "sites"
  const showOffline = c.l1Id === "basic" && c.l2Id === "offline"
  const showFix = c.l1Id === "basic" && c.l2Id === "fix"
  const showReport = c.l1Id === "basic" && c.l2Id === "report"
  const showPing = c.l1Id === "test" && c.l2Id === "ping"
  const showDns = c.l1Id === "test" && c.l2Id === "dns"
  const showTcp = c.l1Id === "test" && c.l2Id === "tcp"
  const showCustom = c.l1Id === "test" && c.l2Id === "custom"
  const showTraceroute = c.l1Id === "test" && c.l2Id === "traceroute"
  const showMtu = c.l1Id === "test" && c.l2Id === "mtu"
  const showEgress = c.l1Id === "test" && c.l2Id === "egress"
  const showComingSoon = !(
    showOverview ||
    showTree ||
    showOpinion ||
    showSites ||
    showOffline ||
    showFix ||
    showReport ||
    showPing ||
    showDns ||
    showTcp ||
    showCustom ||
    showTraceroute ||
    showMtu ||
    showEgress
  )

  const offlineSub = c.offlineSub

  return (
    <RuntimeFeatureGate
      feature={feature}
      icon={<Network size={32} className="opacity-40" />}
      title={t("networkProbe.title")}
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <header className="space-y-1">
          <h1 className="text-lg font-semibold">{t("networkProbe.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("networkProbe.subtitle")}</p>
          {c.capabilities ? (
            <p className="text-muted-foreground font-mono text-[11px]">
              {t("networkProbe.caps.banner", {
                platform: c.capabilities.platform,
                privilege: c.capabilities.privilegeLevel,
              })}
            </p>
          ) : null}
        </header>

        <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label={t("networkProbe.nav.l1")}>
          {L1_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                c.l1Id === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => c.selectL1(id)}
            >
              {t(`networkProbe.l1.${id}`)}
            </button>
          ))}
        </nav>

        <nav className="flex flex-wrap gap-1" aria-label={t("networkProbe.nav.l2")}>
          {l2Items.map((id) => (
            <button
              key={id}
              type="button"
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                c.l2Id === id
                  ? "border-primary bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
              onClick={() => c.selectL2(id)}
            >
              {t(`networkProbe.l2.${id}`)}
              {POST_L2.has(id) ? (
                <span className="text-muted-foreground ml-1">{t("networkProbe.badge.post")}</span>
              ) : null}
            </button>
          ))}
        </nav>

        {errorText ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
            {errorText}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {showOverview ? (
            <OverviewPanel
              loading={c.loadingSummary}
              summary={c.summary}
              firewall={c.firewall}
              hostsSuspiciousCount={hostsSuspicious}
              onRefresh={c.refreshOverview}
              onOpenSettings={c.openSystemNetworkSettings}
            />
          ) : null}

          {showTree ? (
            <HealthTreePanel
              loading={c.loadingHealth}
              result={c.healthResult}
              streamingItems={c.healthStreamingItems}
              canCancel={Boolean(c.activeSessionId)}
              onRun={c.runHealthScan}
              onCancel={c.cancelScan}
            />
          ) : null}

          {showOpinion ? (
            <ScanOpinionPanel result={c.healthResult} onGoTree={() => c.selectL2("tree")} />
          ) : null}

          {showSites ? (
            <SitesProbePanel
              loading={c.loadingSites}
              canCancel={Boolean(c.activeSessionId) && c.loadingSites}
              result={c.sitesResult}
              streaming={c.sitesStreaming}
              sparklines={c.siteSparklineById}
              packIds={sitePackIds}
              toolEnabled={c.toolEnabled.sitesProbe}
              toolStatus={c.toolStatus.sitesProbe}
              onRunPack={c.runSitesProbe}
              onRunCustom={c.runSitesProbeCustom}
              onCancel={c.cancelScan}
            />
          ) : null}

          {showOffline ? (
            <div className="space-y-4">
              <nav className="flex flex-wrap gap-1" aria-label={t("networkProbe.offline.subNav")}>
                {OFFLINE_SUBS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                      offlineSub === id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                    onClick={() => c.selectOfflineSub(id as NetworkProbeOfflineSub)}
                  >
                    {t(`networkProbe.offline.sub.${id}`)}
                  </button>
                ))}
              </nav>

              <OfflinePanel
                loading={c.loadingOffline}
                focus={offlineSub}
                captive={c.captiveResult}
                publicIp={c.publicIpInfo}
                proxyVpn={c.proxyVpnStatus}
                ipv6={c.ipv6Result}
                mtu={c.mtuResult}
                onRunAll={c.runOfflineDiagnostics}
                onOpenMtu={() => {
                  c.selectL1("test")
                  c.selectL2("mtu")
                }}
              />

              {offlineSub === "all" || offlineSub === "ipv6" ? (
                <Ipv6Panel
                  loading={c.loadingIpv6 || c.loadingOffline}
                  result={c.ipv6Result}
                  onRun={c.checkIpv6Stack}
                  dualFrom="offline"
                />
              ) : null}

              {offlineSub === "all" || offlineSub === "mtu" ? (
                <MtuPanel
                  loading={c.loadingMtu || c.loadingOffline}
                  result={c.mtuResult}
                  onRun={c.probePathMtu}
                  dualFrom="offline"
                />
              ) : null}

              {offlineSub === "egress" ? (
                <EgressPanel
                  loading={c.loadingOffline}
                  result={c.publicIpInfo}
                  onRun={c.refreshPublicIp}
                  dualFrom="offline"
                />
              ) : null}
            </div>
          ) : null}

          {showFix ? (
            <FixPanel
              loading={c.loadingFix}
              services={c.networkServices}
              dnsPresets={c.defaults?.dnsPresets ?? []}
              lastResult={c.fixResult}
              onLoadServices={c.loadNetworkServices}
              onFlushDns={c.flushDns}
              onSwitchDns={c.switchDns}
              onRenewDhcp={c.renewDhcp}
              onResetNetworkStack={c.resetNetworkStack}
              onOpenSettings={c.openSystemNetworkSettings}
            />
          ) : null}

          {showReport ? (
            <ReportPanel
              health={c.healthResult}
              commandLog={c.commandLog}
              onClearLog={c.clearCommandLog}
              onGoTree={() => c.selectL2("tree")}
            />
          ) : null}

          {showPing ? (
            <PingPanel
              loading={c.loadingPing}
              result={c.pingResult}
              toolEnabled={c.toolEnabled.ping}
              toolStatus={c.toolStatus.ping}
              onRun={c.runPing}
            />
          ) : null}

          {showDns ? (
            <DnsLookupPanel
              loading={c.loadingDns}
              result={c.dnsResult}
              dnsPresets={c.defaults?.dnsPresets}
              onRun={c.runDnsLookup}
            />
          ) : null}

          {showTcp ? (
            <TcpConnectPanel loading={c.loadingTcp} result={c.tcpResult} onRun={c.runTcpConnect} />
          ) : null}

          {showCustom ? (
            <ProbeTargetPanel
              loading={c.loadingProbe}
              result={c.probeResult}
              onRun={c.runProbeTarget}
            />
          ) : null}

          {showTraceroute ? (
            <TraceroutePanel
              loading={c.loadingTraceroute}
              canCancel={Boolean(c.activeSessionId) && c.loadingTraceroute}
              result={c.tracerouteResult}
              streamingHops={c.tracerouteStreamingHops}
              toolEnabled={c.toolEnabled.traceroute}
              toolStatus={c.toolStatus.traceroute}
              onRun={c.runTraceroute}
              onCancel={c.cancelScan}
            />
          ) : null}

          {showMtu ? (
            <MtuPanel
              loading={c.loadingMtu}
              result={c.mtuResult}
              onRun={c.probePathMtu}
              dualFrom="test"
            />
          ) : null}

          {showEgress ? (
            <EgressPanel
              loading={c.loadingOffline}
              result={c.publicIpInfo}
              onRun={c.refreshPublicIp}
              dualFrom="test"
            />
          ) : null}

          {showComingSoon ? (
            <ComingSoonPanel l1={c.l1Id} l2={c.l2Id} toolStatus={c.capabilities?.tools} />
          ) : null}
        </div>
      </div>
    </RuntimeFeatureGate>
  )
}

function ComingSoonPanel({
  l1,
  l2,
  toolStatus,
}: {
  l1: string
  l2: string
  toolStatus?: Record<string, string>
}) {
  const { t } = useTranslation()
  const post = POST_L2.has(l2)
  return (
    <div className="text-muted-foreground flex h-full flex-col items-start justify-center gap-2 py-10">
      <p className="text-foreground text-sm font-medium">
        {t(`networkProbe.l1.${l1}`)} / {t(`networkProbe.l2.${l2}`)}
      </p>
      <p className="max-w-md text-sm">
        {post ? t("networkProbe.coming.post") : t("networkProbe.coming.mvp")}
      </p>
      {toolStatus ? (
        <p className="font-mono text-xs">
          {t("networkProbe.capabilitiesLine", {
            value: Object.entries(toolStatus)
              .map(([k, v]) => `${k}=${v}`)
              .join(", "),
          })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Page View / 页面视图: compose L1/L2 shell and panels; 只组合页面.
 */
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Network } from "lucide-react"
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate"
import { ArpPanel } from "@/features/network-probe/components/ArpPanel"
import { DnsLookupPanel } from "@/features/network-probe/components/DnsLookupPanel"
import { DnsSecPanel } from "@/features/network-probe/components/DnsSecPanel"
import { EgressPanel } from "@/features/network-probe/components/EgressPanel"
import { FixPanel } from "@/features/network-probe/components/FixPanel"
import { HealthTreePanel } from "@/features/network-probe/components/HealthTreePanel"
import { Ipv6Panel } from "@/features/network-probe/components/Ipv6Panel"
import { LanServicesPanel } from "@/features/network-probe/components/LanServicesPanel"
import { MtuPanel } from "@/features/network-probe/components/MtuPanel"
import { MultiNodePanel } from "@/features/network-probe/components/MultiNodePanel"
import { NatPanel } from "@/features/network-probe/components/NatPanel"
import { NtpPanel } from "@/features/network-probe/components/NtpPanel"
import {
  OfficialSitesPanel,
  OFFICIAL_PACK_ID,
} from "@/features/network-probe/components/OfficialSitesPanel"
import { OfflinePanel } from "@/features/network-probe/components/OfflinePanel"
import { OverviewPanel } from "@/features/network-probe/components/OverviewPanel"
import { PackInstallDialog } from "@/features/network-probe/components/PackInstallDialog"
import { PcapDiagPanel } from "@/features/network-probe/components/PcapDiagPanel"
import { PingPanel } from "@/features/network-probe/components/PingPanel"
import { PollutionPanel } from "@/features/network-probe/components/PollutionPanel"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"
import { ProbeTargetPanel } from "@/features/network-probe/components/ProbeTargetPanel"
import { ReportPanel } from "@/features/network-probe/components/ReportPanel"
import { ScanOpinionPanel } from "@/features/network-probe/components/ScanOpinionPanel"
import { SecurityAuthGate } from "@/features/network-probe/components/SecurityAuthGate"
import { SitesProbePanel } from "@/features/network-probe/components/SitesProbePanel"
import { SpeedPanel } from "@/features/network-probe/components/SpeedPanel"
import { TcpConnectPanel } from "@/features/network-probe/components/TcpConnectPanel"
import { TraceroutePanel } from "@/features/network-probe/components/TraceroutePanel"
import { WhoisPanel } from "@/features/network-probe/components/WhoisPanel"
import { CommandLogSidePanel } from "@/features/network-probe/components/CommandLogSidePanel"
import { useNetworkProbeController } from "@/features/network-probe/hooks/useNetworkProbeController"
import {
  OFFLINE_SUBS,
  type NetworkProbeL1,
  type NetworkProbeOfflineSub,
} from "@/features/network-probe/store"
import { ScrollableArea } from "@/components/common/ScrollableArea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { FeatureDescriptor } from "@/platform/capabilities"

const L1_IDS: NetworkProbeL1[] = ["basic", "test", "security", "discover"]

const L2_BY_L1: Record<NetworkProbeL1, string[]> = {
  basic: ["overview", "tree", "opinion", "sites", "offline", "fix", "report"],
  test: ["ping", "dns", "tcp", "custom", "websites", "traceroute", "mtu", "egress", "speed"],
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
  const [packsOpen, setPacksOpen] = useState(false)
  const [focusPackId, setFocusPackId] = useState<string | null>(null)
  const [packsBusy, setPacksBusy] = useState(false)
  const [nodeId, setNodeId] = useState("local")

  const l2Items = L2_BY_L1[c.l1Id]
  const hostsSuspicious = useMemo(
    () => (c.hosts ?? []).filter((h) => h.suspicious).length,
    [c.hosts],
  )
  const sitePackIds = useMemo(() => Object.keys(c.defaults?.sitePacks ?? {}), [c.defaults])
  const officialPresets = useMemo(
    () => c.defaults?.sitePacks?.[OFFICIAL_PACK_ID] ?? [],
    [c.defaults],
  )
  const probeNodes =
    c.probeNodes.length > 0
      ? c.probeNodes
      : [
          {
            id: "local",
            label: t("networkProbe.nodeSelect.local"),
            kind: "local",
            reachable: true,
          },
        ]
  const activeNode = probeNodes.find((n) => n.id === nodeId) ?? probeNodes[0]

  const errorText = c.error ? t(c.error.key, { defaultValue: c.error.fallback }) : null
  const offlineSub = c.offlineSub
  const panelTitle = t(`networkProbe.l2.${c.l2Id}`)
  const crumbOffline =
    c.l1Id === "basic" && c.l2Id === "offline" && offlineSub !== "all"
      ? t(`networkProbe.offline.sub.${offlineSub}`)
      : null

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
  const showWebsites = c.l1Id === "test" && c.l2Id === "websites"
  const showTraceroute = c.l1Id === "test" && c.l2Id === "traceroute"
  const showMtu = c.l1Id === "test" && c.l2Id === "mtu"
  const showEgress = c.l1Id === "test" && c.l2Id === "egress"
  const showSpeed = c.l1Id === "test" && c.l2Id === "speed"
  const showPorts = c.l1Id === "security" && c.l2Id === "ports"
  const showPollution = c.l1Id === "security" && c.l2Id === "pollution"
  const showDnssec = c.l1Id === "security" && c.l2Id === "dnssec"
  const showWhois = c.l1Id === "security" && c.l2Id === "whois"
  const showArp = c.l1Id === "discover" && c.l2Id === "arp"
  const showLanSvc = c.l1Id === "discover" && c.l2Id === "lan-svc"
  const showNat = c.l1Id === "discover" && c.l2Id === "nat"
  const showNtp = c.l1Id === "discover" && c.l2Id === "ntp"
  const showNodes = c.l1Id === "discover" && c.l2Id === "nodes"
  const showPcap = c.l1Id === "security" && c.l2Id === "pcap"
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
    showWebsites ||
    showTraceroute ||
    showMtu ||
    showEgress ||
    showSpeed ||
    showPorts ||
    showPollution ||
    showDnssec ||
    showWhois ||
    showArp ||
    showLanSvc ||
    showNat ||
    showNtp ||
    showNodes ||
    showPcap
  )

  return (
    <RuntimeFeatureGate
      feature={feature}
      icon={<Network size={32} className="opacity-40" />}
      title={t("networkProbe.title")}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* L1 top bar — prototype .l1 */}
        <header className="bg-background flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <div className="flex shrink-0 items-center gap-2 border-r pr-3">
            <span
              className="bg-primary/20 ring-primary/30 size-2 rounded-full ring-2"
              aria-hidden
            />
            <span className="text-sm font-semibold whitespace-nowrap">
              {t("networkProbe.title")}
            </span>
          </div>
          <nav
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
            aria-label={t("networkProbe.nav.l1")}
          >
            {L1_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "shrink-0 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                  c.l1Id === id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => c.selectL1(id)}
              >
                {t(`networkProbe.l1.${id}`)}
              </button>
            ))}
          </nav>
          <Select
            value={activeNode?.id ?? "local"}
            onValueChange={(v) => {
              if (v) setNodeId(v)
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-8 w-[9.5rem] shrink-0"
              aria-label={t("networkProbe.nodeSelect.label")}
            >
              <SelectValue placeholder={t("networkProbe.nodeSelect.label")} />
            </SelectTrigger>
            <SelectContent>
              {probeNodes.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => {
              setFocusPackId(null)
              setPacksOpen(true)
            }}
          >
            {t("networkProbe.packs.manage")}
          </Button>
        </header>

        {/* Workspace: L3 + command log — prototype .workspace */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
            <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-3 overflow-hidden">
              <div className="flex shrink-0 flex-wrap items-baseline gap-2">
                <h2 className="text-base font-semibold">{panelTitle}</h2>
                <p className="text-muted-foreground text-[11px]">
                  <span>{t(`networkProbe.l1.${c.l1Id}`)}</span>
                  <span className="mx-1 opacity-50">/</span>
                  <span>{panelTitle}</span>
                  {crumbOffline ? (
                    <>
                      <span className="mx-1 opacity-50">/</span>
                      <span>{crumbOffline}</span>
                    </>
                  ) : null}
                  {c.capabilities ? (
                    <>
                      <span className="mx-1 opacity-50">·</span>
                      <span className="font-mono">
                        {t("networkProbe.caps.banner", {
                          platform: c.capabilities.platform,
                          privilege: c.capabilities.privilegeLevel,
                        })}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>

              {errorText ? (
                <div className="border-destructive/40 bg-destructive/5 text-destructive shrink-0 rounded-md border px-3 py-2 text-sm">
                  {errorText}
                </div>
              ) : null}

              {c.l1Id === "security" ? (
                <div className="shrink-0">
                  <SecurityAuthGate
                    authorized={c.securityAuthorized}
                    onAuthorize={c.authorizeSecurity}
                    onRevoke={c.revokeSecurity}
                  />
                </div>
              ) : null}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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
                  <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                    <nav
                      className="flex shrink-0 flex-wrap gap-1.5"
                      aria-label={t("networkProbe.offline.subNav")}
                    >
                      {OFFLINE_SUBS.map((id) => (
                        <button
                          key={id}
                          type="button"
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                            offlineSub === id
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                          onClick={() => c.selectOfflineSub(id as NetworkProbeOfflineSub)}
                        >
                          {t(`networkProbe.offline.sub.${id}`)}
                        </button>
                      ))}
                    </nav>

                    <ScrollableArea
                      wrapperClassName="flex min-h-0 min-w-0 flex-1"
                      className="min-h-0 flex-1 pr-1 pb-1"
                      showBottomDot={false}
                    >
                      <div className="space-y-6">
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
                    </ScrollableArea>
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
                    history={c.reportHistory}
                    commandLog={c.commandLog}
                    onClearLog={c.clearCommandLog}
                    onClearHistory={c.clearReportHistory}
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
                  <TcpConnectPanel
                    loading={c.loadingTcp}
                    result={c.tcpResult}
                    onRun={c.runTcpConnect}
                  />
                ) : null}

                {showCustom ? (
                  <ProbeTargetPanel
                    loading={c.loadingProbe}
                    result={c.probeResult}
                    onRun={c.runProbeTarget}
                  />
                ) : null}

                {showWebsites ? (
                  <OfficialSitesPanel
                    loading={c.loadingSites}
                    canCancel={Boolean(c.activeSessionId) && c.loadingSites}
                    presets={officialPresets}
                    result={c.sitesResult}
                    streaming={c.sitesStreaming}
                    toolEnabled={c.toolEnabled.sitesProbe}
                    toolStatus={c.toolStatus.sitesProbe}
                    onTestAll={() => c.runSitesProbe(OFFICIAL_PACK_ID)}
                    onTestOne={(target) => c.runSitesProbeCustom([target])}
                    onCancel={c.cancelScan}
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

                {showSpeed ? (
                  <SpeedPanel
                    loading={c.loadingSpeed}
                    canCancel={c.loadingSpeed && Boolean(c.activeSessionId)}
                    sources={c.speedSources}
                    result={c.speedResult}
                    sample={c.speedSample}
                    cooldownUntil={c.speedCooldownUntil}
                    toolEnabled={c.toolEnabled.speedTest}
                    toolStatus={c.toolStatus.speedTest}
                    onLoadSources={c.loadSpeedSources}
                    onRun={c.runSpeedTest}
                    onCancel={c.cancelScan}
                  />
                ) : null}

                {showPorts && c.securityAuthorized ? (
                  <PortScanPanel
                    loading={c.loadingPorts}
                    canCancel={c.loadingPorts && Boolean(c.activeSessionId)}
                    result={c.portScanResult}
                    streaming={c.portScanStreaming}
                    toolEnabled={c.toolEnabled.portScan}
                    toolStatus={c.toolStatus.portScan}
                    onRun={c.runPortScan}
                    onCancel={c.cancelScan}
                  />
                ) : null}

                {showPollution && c.securityAuthorized ? (
                  <PollutionPanel
                    loading={c.loadingPollution}
                    result={c.pollutionResult}
                    toolEnabled={c.toolEnabled.pollution}
                    toolStatus={c.toolStatus.pollution}
                    onRun={c.runPollutionCheck}
                  />
                ) : null}

                {showDnssec && c.securityAuthorized ? (
                  <DnsSecPanel
                    loading={c.loadingDnssec}
                    result={c.dnssecResult}
                    toolEnabled={c.toolEnabled.dnssec}
                    toolStatus={c.toolStatus.dnssec}
                    onRun={c.runDnssec}
                  />
                ) : null}

                {showWhois && c.securityAuthorized ? (
                  <WhoisPanel
                    loading={c.loadingWhois}
                    result={c.whoisResult}
                    toolEnabled={c.toolEnabled.whois}
                    toolStatus={c.toolStatus.whois}
                    onRun={c.runWhois}
                  />
                ) : null}

                {showPcap && c.securityAuthorized ? (
                  <PcapDiagPanel
                    loading={c.loadingPcap}
                    result={c.pcapResult}
                    toolEnabled={c.toolEnabled.pcap}
                    toolStatus={c.toolStatus.pcap}
                    canCancel={c.loadingPcap && Boolean(c.activeSessionId)}
                    onRun={() => c.runPcapDiag(5)}
                    onCancel={c.cancelScan}
                    onManagePacks={() => {
                      setFocusPackId("pcap-diag")
                      setPacksOpen(true)
                    }}
                  />
                ) : null}

                {showArp ? (
                  <ArpPanel
                    loading={c.loadingLan}
                    result={c.lanResult}
                    toolEnabled={c.toolEnabled.arp}
                    toolStatus={c.toolStatus.arp}
                    canCancel={c.loadingLan && Boolean(c.activeSessionId)}
                    onRun={c.discoverLan}
                    onCancel={c.cancelScan}
                    onOpenSettings={c.openSystemNetworkSettings}
                  />
                ) : null}

                {showLanSvc ? (
                  <LanServicesPanel
                    loading={c.loadingLanServices}
                    result={c.lanServicesResult}
                    toolEnabled={c.toolEnabled.lanServices}
                    toolStatus={c.toolStatus.lanServices}
                    onRun={c.browseLanServices}
                  />
                ) : null}

                {showNat ? (
                  <NatPanel
                    loading={c.loadingNat}
                    result={c.natResult}
                    toolEnabled={c.toolEnabled.nat}
                    toolStatus={c.toolStatus.nat}
                    onRun={c.probeNat}
                  />
                ) : null}

                {showNtp ? (
                  <NtpPanel
                    loading={c.loadingNtp}
                    result={c.ntpResult}
                    toolEnabled={c.toolEnabled.ntp}
                    toolStatus={c.toolStatus.ntp}
                    onRun={c.probeNtp}
                  />
                ) : null}

                {showNodes ? (
                  <MultiNodePanel
                    loading={c.loadingMultiNode}
                    loadingNodes={c.loadingNodes}
                    result={c.multiNodeDnsResult}
                    nodes={c.probeNodes}
                    toolEnabled={c.toolEnabled.multiNode}
                    toolStatus={c.toolStatus.multiNode}
                    onCompare={c.compareDnsMulti}
                    onRefreshNodes={c.refreshProbeNodes}
                    onAddAgent={c.addAgent}
                    onRemoveAgent={c.removeAgent}
                  />
                ) : null}

                {showComingSoon ? (
                  <ComingSoonPanel
                    l1={c.l1Id}
                    l2={c.l2Id}
                    toolStatus={c.capabilities?.tools}
                    externalTools={c.capabilities?.externalTools}
                    onManagePacks={(packId) => {
                      setFocusPackId(packId ?? null)
                      setPacksOpen(true)
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="hidden min-h-0 lg:flex lg:h-full lg:flex-col">
            <CommandLogSidePanel lines={c.commandLog} onClear={c.clearCommandLog} />
          </div>
        </div>

        {/* L2 bottom rail — prototype .l2 */}
        <nav
          className="bg-background flex h-11 shrink-0 items-center gap-2 border-t px-3"
          aria-label={t("networkProbe.nav.l2")}
        >
          <span className="text-muted-foreground shrink-0 border-r pr-2 text-[10px] font-bold tracking-wider uppercase">
            {t("networkProbe.nav.l2Short")}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {l2Items.map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
                  c.l2Id === id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => c.selectL2(id)}
              >
                {t(`networkProbe.l2.${id}`)}
                {POST_L2.has(id) ? (
                  <span className="text-muted-foreground ml-1 text-[10px]">
                    {t("networkProbe.badge.post")}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </nav>

        <PackInstallDialog
          open={packsOpen}
          packs={c.capabilityPacks}
          busy={packsBusy}
          progressText={c.packProgressText}
          focusPackId={focusPackId}
          onOpenChange={setPacksOpen}
          onRefresh={() => void c.refreshCapabilityPacks()}
          onInstall={(packId) => {
            setPacksBusy(true)
            void c.installCapabilityPack(packId).finally(() => setPacksBusy(false))
          }}
          onVerifyFail={(packId) => {
            setPacksBusy(true)
            void c.installCapabilityPackVerifyFail(packId).finally(() => setPacksBusy(false))
          }}
          onUninstall={(packId) => {
            setPacksBusy(true)
            void c.uninstallCapabilityPack(packId).finally(() => setPacksBusy(false))
          }}
        />
      </div>
    </RuntimeFeatureGate>
  )
}

const L2_PACK_HINT: Record<string, string> = {
  ports: "adv-scanner",
  pcap: "pcap-diag",
  arp: "adv-scanner",
}

function ComingSoonPanel({
  l1,
  l2,
  toolStatus,
  externalTools,
  onManagePacks,
}: {
  l1: string
  l2: string
  toolStatus?: Record<string, string>
  externalTools?: Record<string, string>
  onManagePacks: (packId?: string) => void
}) {
  const { t } = useTranslation()
  const post = POST_L2.has(l2)
  const toolKey =
    l2 === "ports"
      ? "portScan"
      : l2 === "pcap"
        ? "pcap"
        : l2 === "arp"
          ? "arp"
          : l2 === "speed"
            ? "speedTest"
            : null
  const status = toolKey ? toolStatus?.[toolKey] : undefined
  const packId = L2_PACK_HINT[l2]
  const missing = status === "missing_pack"

  return (
    <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-start justify-center gap-2 overflow-auto py-6">
      <p className="text-foreground text-sm font-medium">
        {t(`networkProbe.l1.${l1}`)} / {t(`networkProbe.l2.${l2}`)}
      </p>
      <p className="max-w-md text-sm">
        {post ? t("networkProbe.coming.post") : t("networkProbe.coming.mvp")}
      </p>
      {missing && packId ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("networkProbe.packs.missingHint", { packId })}
        </p>
      ) : null}
      {toolStatus && toolKey ? (
        <p className="font-mono text-xs">
          {toolKey}={status ?? "—"}
          {externalTools?.nmap ? ` · nmap=${externalTools.nmap}` : ""}
        </p>
      ) : toolStatus ? (
        <p className="font-mono text-xs">
          {t("networkProbe.capabilitiesLine", {
            value: Object.entries(toolStatus)
              .map(([k, v]) => `${k}=${v}`)
              .join(", "),
          })}
        </p>
      ) : null}
      <Button type="button" size="sm" variant="outline" onClick={() => onManagePacks(packId)}>
        {t("networkProbe.packs.manage")}
      </Button>
    </div>
  )
}

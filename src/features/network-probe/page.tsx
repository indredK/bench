/**
 * Page View / 页面视图: compose L1/L2 shell and panels; 只组合页面.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Network, Package, SlidersHorizontal } from "lucide-react"
import { RuntimeFeatureGate } from "@/components/common/RuntimeFeatureGate"
import { ArpPanel } from "@/features/network-probe/components/ArpPanel"
import { BasicView, focusBasicViewSection } from "@/features/network-probe/components/BasicView"
import { DnsLookupPanel } from "@/features/network-probe/components/DnsLookupPanel"
import { DefaultsEditorDialog } from "@/features/network-probe/components/DefaultsEditorDialog"
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
import { isNetworkProbeErrorVisible } from "@/features/network-probe/error-scope"
import { getProbeNodeDisplayLabel } from "@/features/network-probe/node-label"
import type { NetworkProbeL1 } from "@/features/network-probe/store"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { FeatureDescriptor } from "@/platform/capabilities"

const L1_IDS: NetworkProbeL1[] = ["basic", "sites", "test", "security", "discover"]

const L2_BY_L1: Record<NetworkProbeL1, string[]> = {
  basic: ["overview", "tree", "opinion", "offline", "fix", "report"],
  sites: ["official", "packs"],
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

const showPackVerifyTestControl =
  import.meta.env.DEV || import.meta.env.VITE_BENCH_ENABLE_PACK_VERIFY_TEST === "1"

export default function NetworkProbePage({ feature }: { feature?: FeatureDescriptor }) {
  const { t } = useTranslation()
  const c = useNetworkProbeController()
  const [packsOpen, setPacksOpen] = useState(false)
  const [focusPackId, setFocusPackId] = useState<string | null>(null)
  const [packsBusy, setPacksBusy] = useState(false)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const [defaultsBusy, setDefaultsBusy] = useState(false)
  const [sideLogOpen, setSideLogOpen] = useState(true)

  const openPackDialog = (packId: string | null) => {
    c.clearPackInstallResult()
    setFocusPackId(packId)
    setPacksOpen(true)
  }

  const l2Items = L2_BY_L1[c.l1Id]
  const resolvedL2 = l2Items.includes(c.l2Id) ? c.l2Id : l2Items[0]!

  const navigateToBasicSection = (id: string, moveFocus = false) => {
    c.selectL2(id)
    if (c.l1Id !== "basic" || typeof window === "undefined") return
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      const section = document.getElementById(`network-probe-basic-${id}`)
      if (!section) return
      section.scrollIntoView?.({ behavior: reducedMotion ? "auto" : "smooth", block: "start" })
      if (moveFocus) focusBasicViewSection(id)
    })
  }

  const handleBasicSectionChange = useCallback(
    (id: string) => {
      if (c.l2Id !== id) c.selectL2(id, { preserveError: true })
    },
    [c.l2Id, c.selectL2],
  )

  useEffect(() => {
    if (c.l2Id !== resolvedL2) c.selectL2(resolvedL2)
  }, [c.l2Id, c.selectL2, resolvedL2])

  const activeSessionIdByKind = c.activeSessionIdByKind
  const hostsSuspicious = useMemo(
    () => (c.hosts ?? []).filter((h) => h.suspicious).length,
    [c.hosts],
  )
  const sitePackIds = useMemo(
    () => Object.keys(c.defaults?.sitePacks ?? {}).filter((id) => id !== OFFICIAL_PACK_ID),
    [c.defaults],
  )
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
  // 通用面板仍只允许本机执行；Globalping 的 DNS / Ping / HTTP 仅在多节点面板显式发起。
  // 自有 agent 当前只有健康检查。禁止把这些节点接入通用探测入口造成假路由。
  const activeNode = useMemo(
    () => probeNodes.find((n) => n.kind === "local") ?? probeNodes[0],
    [probeNodes],
  )

  const offlineSub = c.offlineSub
  const errorVisible = c.error
    ? isNetworkProbeErrorVisible(
        c.error,
        c.l1Id,
        c.l1Id === "basic" ? "integrated" : resolvedL2,
        c.l1Id === "basic" ? "all" : offlineSub,
      )
    : false
  const errorText = errorVisible ? t(c.error!.key, { defaultValue: c.error!.fallback }) : null
  const defaultsError =
    c.error?.key === "networkProbe.errors.defaultsFailed"
      ? t(c.error.key, { defaultValue: c.error.fallback })
      : null
  const offlineHasError = Boolean(
    c.error && isNetworkProbeErrorVisible(c.error, "basic", "offline", "all"),
  )
  const panelTitle =
    c.l1Id === "basic" ? t("networkProbe.l1.basic") : t(`networkProbe.l2.${resolvedL2}`)

  const showBasic = c.l1Id === "basic"
  const showOfficialSites = c.l1Id === "sites" && resolvedL2 === "official"
  const showSitePacks = c.l1Id === "sites" && resolvedL2 === "packs"
  const showPing = c.l1Id === "test" && resolvedL2 === "ping"
  const showDns = c.l1Id === "test" && resolvedL2 === "dns"
  const showTcp = c.l1Id === "test" && resolvedL2 === "tcp"
  const showCustom = c.l1Id === "test" && resolvedL2 === "custom"
  const showTraceroute = c.l1Id === "test" && resolvedL2 === "traceroute"
  const showMtu = c.l1Id === "test" && resolvedL2 === "mtu"
  const showEgress = c.l1Id === "test" && resolvedL2 === "egress"
  const showSpeed = c.l1Id === "test" && resolvedL2 === "speed"
  const showPorts = c.l1Id === "security" && resolvedL2 === "ports"
  const showPollution = c.l1Id === "security" && resolvedL2 === "pollution"
  const showDnssec = c.l1Id === "security" && resolvedL2 === "dnssec"
  const showWhois = c.l1Id === "security" && resolvedL2 === "whois"
  const showArp = c.l1Id === "discover" && resolvedL2 === "arp"
  const showLanSvc = c.l1Id === "discover" && resolvedL2 === "lan-svc"
  const showNat = c.l1Id === "discover" && resolvedL2 === "nat"
  const showNtp = c.l1Id === "discover" && resolvedL2 === "ntp"
  const showNodes = c.l1Id === "discover" && resolvedL2 === "nodes"
  const showPcap = c.l1Id === "security" && resolvedL2 === "pcap"
  const showComingSoon = !(
    showBasic ||
    showOfficialSites ||
    showSitePacks ||
    showPing ||
    showDns ||
    showTcp ||
    showCustom ||
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
            <h1 className="text-sm font-semibold whitespace-nowrap">{t("networkProbe.title")}</h1>
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
                aria-current={c.l1Id === id ? "page" : undefined}
                onClick={() => c.selectL1(id)}
              >
                {t(`networkProbe.l1.${id}`)}
              </button>
            ))}
          </nav>
          {/* 通用探测原点当前只有本机可选；Globalping 仅能在多节点面板显式调用。 */}
          <Select value={activeNode?.id ?? "local"}>
            <TooltipProvider delay={280}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SelectTrigger
                    size="sm"
                    className="h-8 w-[9.5rem] shrink-0"
                    aria-label={t("networkProbe.nodeSelect.label")}
                  >
                    <SelectValue placeholder={t("networkProbe.nodeSelect.label")} />
                  </SelectTrigger>
                </TooltipTrigger>
                <TooltipContent className="text-[11px]">
                  {t("networkProbe.nodeSelect.localOnlyHint")}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <SelectContent>
              {probeNodes.map((n) => {
                const pending = n.kind !== "local"
                return (
                  <SelectItem key={n.id} value={n.id} disabled={pending}>
                    {getProbeNodeDisplayLabel(n, t("networkProbe.nodeSelect.local"))}
                    {pending ? (
                      <span className="text-muted-foreground ml-1 text-[10px] font-bold tracking-wider uppercase">
                        {t(
                          n.kind === "remote-proxy"
                            ? "networkProbe.badge.multiNodeOnly"
                            : "networkProbe.badge.planning",
                        )}
                      </span>
                    ) : null}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <TooltipProvider delay={280}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 px-2 xl:px-3"
                  aria-label={t("networkProbe.defaults.manage")}
                  onClick={() => setDefaultsOpen(true)}
                >
                  <SlidersHorizontal aria-hidden="true" />
                  <span className="hidden xl:inline">{t("networkProbe.defaults.manage")}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("networkProbe.defaults.manage")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 px-2 xl:px-3"
                  aria-label={t("networkProbe.packs.manage")}
                  onClick={() => openPackDialog(null)}
                >
                  <Package aria-hidden="true" />
                  <span className="hidden xl:inline">{t("networkProbe.packs.manage")}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("networkProbe.packs.manage")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </header>

        {/* Workspace: L3 + command log — prototype .workspace */}
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 overflow-hidden",
            sideLogOpen
              ? "lg:grid-cols-[minmax(0,1fr)_280px]"
              : "lg:grid-cols-[minmax(0,1fr)_2.25rem]",
          )}
        >
          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
            <div
              className={cn(
                "mx-auto flex h-full min-h-0 w-full flex-col gap-3 overflow-hidden",
                c.l1Id === "sites" ? "max-w-6xl" : "max-w-5xl",
              )}
            >
              <div className="flex shrink-0 flex-wrap items-baseline gap-2">
                <h2 className="text-base font-semibold">{panelTitle}</h2>
                <p className="text-muted-foreground text-[11px]">
                  {c.l1Id === "basic" ? (
                    <span>{t("networkProbe.basic.viewDescription")}</span>
                  ) : (
                    <>
                      <span>{t(`networkProbe.l1.${c.l1Id}`)}</span>
                      <span className="mx-1 opacity-50">/</span>
                      <span>{panelTitle}</span>
                    </>
                  )}
                  {c.l1Id !== "basic" && c.capabilities ? (
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
                <div
                  className="border-destructive/40 bg-destructive/5 text-destructive flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  role="alert"
                  aria-live="assertive"
                >
                  <span>{errorText}</span>
                  {c.error?.key === "networkProbe.errors.bootstrapFailed" ||
                  c.error?.key === "networkProbe.errors.agentRegistryLimitExceeded" ||
                  c.error?.key === "networkProbe.errors.agentRegistryTooLarge" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={c.loadingBootstrap}
                      onClick={() => void c.retryBootstrap()}
                    >
                      {t(c.loadingBootstrap ? "common.loading" : "common.retry")}
                    </Button>
                  ) : c.error?.key === "networkProbe.errors.icmpUnavailable" &&
                    c.capabilities?.platform === "macos" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={c.openingPrivacySettings}
                      onClick={c.openLocalNetworkPrivacySettings}
                    >
                      {t(
                        c.openingPrivacySettings
                          ? "networkProbe.ping.openingPrivacySettings"
                          : "networkProbe.ping.openPrivacySettings",
                      )}
                    </Button>
                  ) : null}
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
                {showBasic ? (
                  <BasicView
                    initialSectionId={resolvedL2}
                    onActiveSectionChange={handleBasicSectionChange}
                    sections={[
                      {
                        id: "overview",
                        title: t("networkProbe.l2.overview"),
                        content: (
                          <OverviewPanel
                            embedded
                            loading={c.loadingSummary}
                            summary={c.summary}
                            firewall={c.firewall}
                            hostsSuspiciousCount={hostsSuspicious}
                            openingSettings={c.openingSystemNetworkSettings}
                            onAutoLoadOverview={c.autoLoadOverview}
                            onRefresh={c.refreshOverview}
                            onOpenSettings={c.openSystemNetworkSettings}
                          />
                        ),
                      },
                      {
                        id: "tree",
                        title: t("networkProbe.l2.tree"),
                        content: (
                          <HealthTreePanel
                            embedded
                            loading={c.loadingHealth}
                            result={c.healthResult}
                            streamingItems={c.healthStreamingItems}
                            canCancel={Boolean(activeSessionIdByKind.health)}
                            cancelling={c.cancellingByKind.health}
                            onRun={c.runHealthScan}
                            onCancel={() => c.cancelScan("health")}
                          />
                        ),
                      },
                      {
                        id: "opinion",
                        title: t("networkProbe.l2.opinion"),
                        content: (
                          <ScanOpinionPanel
                            embedded
                            result={c.healthResult}
                            onGoTree={() => navigateToBasicSection("tree", true)}
                          />
                        ),
                      },
                      {
                        id: "offline",
                        title: t("networkProbe.l2.offline"),
                        content: (
                          <div className="space-y-4">
                            <OfflinePanel
                              loading={c.loadingOffline}
                              disabled={c.loadingIpv6 || c.loadingMtu}
                              focus="all"
                              captive={c.captiveResult}
                              publicIp={c.publicIpInfo}
                              proxyVpn={c.proxyVpnStatus}
                              ipv6={c.ipv6Result}
                              mtu={c.mtuResult}
                              mtuToolEnabled={c.toolEnabled.pathMtu}
                              mtuToolStatus={c.toolStatus.pathMtu}
                              compactSummary
                              onRunAll={c.runOfflineDiagnostics}
                              onOpenMtu={() => {
                                c.selectL1("test")
                                c.selectL2("mtu")
                              }}
                            />
                            <Ipv6Panel
                              loading={c.loadingIpv6 || c.loadingOffline}
                              result={c.ipv6Result}
                              onRun={c.checkIpv6Stack}
                              dualFrom="offline"
                            />
                            <MtuPanel
                              loading={c.loadingMtu || c.loadingOffline}
                              result={c.mtuResult}
                              hasError={offlineHasError}
                              toolEnabled={c.toolEnabled.pathMtu}
                              toolStatus={c.toolStatus.pathMtu}
                              mtuTargets={c.defaults?.mtuTargets}
                              onRun={c.probePathMtu}
                              dualFrom="offline"
                            />
                            <EgressPanel
                              loading={c.loadingOffline}
                              result={c.publicIpInfo}
                              hasError={offlineHasError}
                              onRun={c.refreshPublicIp}
                              dualFrom="offline"
                            />
                          </div>
                        ),
                      },
                      {
                        id: "fix",
                        title: t("networkProbe.l2.fix"),
                        content: (
                          <FixPanel
                            embedded
                            active={resolvedL2 === "fix"}
                            loading={c.loadingFix}
                            loadingServices={c.loadingNetworkServices}
                            openingSettings={c.openingSystemNetworkSettings}
                            toolEnabled={{
                              flushDns: c.toolEnabled.flushDns,
                              switchDns: c.toolEnabled.switchDns,
                              renewDhcp: c.toolEnabled.renewDhcp,
                              resetNetworkStack: c.toolEnabled.resetNetworkStack,
                            }}
                            toolStatus={{
                              flushDns: c.toolStatus.flushDns,
                              switchDns: c.toolStatus.switchDns,
                              renewDhcp: c.toolStatus.renewDhcp,
                              resetNetworkStack: c.toolStatus.resetNetworkStack,
                            }}
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
                        ),
                      },
                      {
                        id: "report",
                        title: t("networkProbe.l2.report"),
                        content: (
                          <ReportPanel
                            embedded
                            health={c.healthResult}
                            history={c.reportHistory}
                            commandLog={c.commandLog}
                            onClearLog={c.clearCommandLog}
                            onClearHistory={c.clearReportHistory}
                            onGoTree={() => navigateToBasicSection("tree", true)}
                          />
                        ),
                      },
                    ]}
                  />
                ) : null}

                {showSitePacks ? (
                  <SitesProbePanel
                    loading={c.loadingSites}
                    canCancel={Boolean(activeSessionIdByKind.sites) && c.loadingSites}
                    cancelling={c.cancellingByKind.sites}
                    result={c.sitesResult}
                    streaming={c.sitesStreaming}
                    sparklines={c.siteSparklineById}
                    packIds={sitePackIds}
                    toolEnabled={c.toolEnabled.sitesProbe}
                    toolStatus={c.toolStatus.sitesProbe}
                    onRunPack={c.runSitesProbe}
                    onRunCustom={c.runSitesProbeCustom}
                    onCancel={() => c.cancelScan("sites")}
                  />
                ) : null}

                {showOfficialSites ? (
                  <OfficialSitesPanel
                    loading={c.loadingSites}
                    canCancel={Boolean(activeSessionIdByKind.sites) && c.loadingSites}
                    cancelling={c.cancellingByKind.sites}
                    presets={officialPresets}
                    latestByTarget={c.siteLatestByTarget}
                    result={c.sitesResult}
                    toolEnabled={c.toolEnabled.sitesProbe}
                    toolStatus={c.toolStatus.sitesProbe}
                    onTestAll={() => c.runSitesProbe(OFFICIAL_PACK_ID)}
                    onTestOne={(target) => c.runSitesProbeCustom([target])}
                    onCancel={() => c.cancelScan("sites")}
                  />
                ) : null}

                {showPing ? (
                  <PingPanel
                    loading={c.loadingPing}
                    result={c.pingResult}
                    streamingSamples={c.pingStreamingSamples}
                    hasError={Boolean(errorText)}
                    toolEnabled={c.toolEnabled.ping}
                    toolStatus={c.toolStatus.ping}
                    canCancel={Boolean(activeSessionIdByKind.ping) && c.loadingPing}
                    cancelling={c.cancellingByKind.ping}
                    openingPrivacySettings={c.openingPrivacySettings}
                    onRun={c.runPing}
                    onCancel={() => c.cancelScan("ping")}
                    onOpenPrivacySettings={
                      c.capabilities?.platform === "macos"
                        ? c.openLocalNetworkPrivacySettings
                        : undefined
                    }
                  />
                ) : null}

                {showDns ? (
                  <DnsLookupPanel
                    loading={c.loadingDns}
                    result={c.dnsResult}
                    hasError={Boolean(errorText)}
                    dnsPresets={c.defaults?.dnsPresets}
                    onRun={c.runDnsLookup}
                  />
                ) : null}

                {showTcp ? (
                  <TcpConnectPanel
                    loading={c.loadingTcp}
                    result={c.tcpResult}
                    hasError={Boolean(errorText)}
                    onRun={c.runTcpConnect}
                  />
                ) : null}

                {showCustom ? (
                  <ProbeTargetPanel
                    loading={c.loadingProbe}
                    result={c.probeResult}
                    hasError={Boolean(errorText)}
                    onRun={c.runProbeTarget}
                  />
                ) : null}

                {showTraceroute ? (
                  <TraceroutePanel
                    loading={c.loadingTraceroute}
                    canCancel={Boolean(activeSessionIdByKind.traceroute) && c.loadingTraceroute}
                    cancelling={c.cancellingByKind.traceroute}
                    result={c.tracerouteResult}
                    hasError={Boolean(errorText)}
                    streamingHops={c.tracerouteStreamingHops}
                    toolEnabled={c.toolEnabled.traceroute}
                    toolStatus={c.toolStatus.traceroute}
                    onRun={c.runTraceroute}
                    onCancel={() => c.cancelScan("traceroute")}
                  />
                ) : null}

                {showMtu ? (
                  <MtuPanel
                    loading={c.loadingMtu || c.loadingOffline}
                    result={c.mtuResult}
                    hasError={Boolean(errorText)}
                    toolEnabled={c.toolEnabled.pathMtu}
                    toolStatus={c.toolStatus.pathMtu}
                    mtuTargets={c.defaults?.mtuTargets}
                    onRun={c.probePathMtu}
                    dualFrom="test"
                  />
                ) : null}

                {showEgress ? (
                  <EgressPanel
                    loading={c.loadingOffline}
                    result={c.publicIpInfo}
                    hasError={Boolean(errorText)}
                    onRun={c.refreshPublicIp}
                    dualFrom="test"
                  />
                ) : null}

                {showSpeed ? (
                  <SpeedPanel
                    loading={c.loadingSpeed}
                    canCancel={c.loadingSpeed && Boolean(activeSessionIdByKind.speed)}
                    cancelling={c.cancellingByKind.speed}
                    sources={c.speedSources}
                    result={c.speedResult}
                    hasError={Boolean(errorText)}
                    sample={c.speedSample}
                    cooldownUntil={c.speedCooldownUntil}
                    toolEnabled={c.toolEnabled.speedTest}
                    toolStatus={c.toolStatus.speedTest}
                    onLoadSources={c.loadSpeedSources}
                    onRun={c.runSpeedTest}
                    onCancel={() => c.cancelScan("speed")}
                  />
                ) : null}

                {showPorts && c.securityAuthorized ? (
                  <PortScanPanel
                    loading={c.loadingPorts}
                    canCancel={c.loadingPorts && Boolean(activeSessionIdByKind.ports)}
                    cancelling={c.cancellingByKind.ports}
                    result={c.portScanResult}
                    streaming={c.portScanStreaming}
                    toolEnabled={c.toolEnabled.portScan}
                    toolStatus={c.toolStatus.portScan}
                    onRun={c.runPortScan}
                    onCancel={() => c.cancelScan("ports")}
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
                    canCancel={c.loadingPcap && Boolean(activeSessionIdByKind.pcap)}
                    cancelling={c.cancellingByKind.pcap}
                    onRun={() => c.runPcapDiag(5)}
                    onCancel={() => c.cancelScan("pcap")}
                    onManagePacks={() => openPackDialog("pcap-diag")}
                  />
                ) : null}

                {showArp ? (
                  <ArpPanel
                    loading={c.loadingLan}
                    result={c.lanResult}
                    progress={c.lanProgress}
                    toolEnabled={c.toolEnabled.arp}
                    toolStatus={c.toolStatus.arp}
                    canCancel={c.loadingLan && Boolean(activeSessionIdByKind.lan)}
                    cancelling={c.cancellingByKind.lan}
                    onRun={c.discoverLan}
                    onCancel={() => c.cancelScan("lan")}
                    onOpenSettings={c.openSystemNetworkSettings}
                    onOpenPrivacySettings={
                      c.capabilities?.platform === "macos"
                        ? c.openLocalNetworkPrivacySettings
                        : undefined
                    }
                  />
                ) : null}

                {showLanSvc ? (
                  <LanServicesPanel
                    loading={c.loadingLanServices}
                    progress={c.lanServicesProgress}
                    result={c.lanServicesResult}
                    toolEnabled={c.toolEnabled.lanServices}
                    toolStatus={c.toolStatus.lanServices}
                    canCancel={Boolean(c.activeSessionIdByKind.lanServices)}
                    cancelling={c.cancellingByKind.lanServices}
                    onRun={c.browseLanServices}
                    onCancel={() => c.cancelScan("lanServices")}
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
                    globalpingResult={c.globalpingMeasurementResult}
                    nodes={c.probeNodes}
                    globalpingTokenConfigured={c.globalpingTokenConfigured}
                    loadingGlobalpingToken={c.loadingGlobalpingToken}
                    toolEnabled={c.toolEnabled.multiNode}
                    toolStatus={c.toolStatus.multiNode}
                    canCancel={c.loadingMultiNode && Boolean(activeSessionIdByKind.multiNode)}
                    cancelling={c.cancellingByKind.multiNode}
                    onCompare={c.compareDnsMulti}
                    onMeasureGlobalping={c.measureGlobalping}
                    onCancel={() => c.cancelScan("multiNode")}
                    onRefreshNodes={c.refreshProbeNodes}
                    onRefreshGlobalpingTokenStatus={c.refreshGlobalpingTokenStatus}
                    onSaveGlobalpingToken={c.saveGlobalpingToken}
                    onClearGlobalpingToken={c.clearGlobalpingToken}
                    onAddAgent={c.addAgent}
                    onRemoveAgent={c.removeAgent}
                  />
                ) : null}

                {showComingSoon ? (
                  <ComingSoonPanel
                    l1={c.l1Id}
                    l2={resolvedL2}
                    toolStatus={c.capabilities?.tools}
                    externalTools={c.capabilities?.externalTools}
                    onManagePacks={(packId) => openPackDialog(packId ?? null)}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="hidden min-h-0 lg:flex lg:h-full lg:flex-col">
            <CommandLogSidePanel
              lines={c.commandLog}
              onClear={c.clearCommandLog}
              onOpenChange={setSideLogOpen}
            />
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
                  resolvedL2 === id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                aria-current={
                  resolvedL2 === id ? (c.l1Id === "basic" ? "location" : "page") : undefined
                }
                aria-controls={c.l1Id === "basic" ? `network-probe-basic-${id}` : undefined}
                onClick={(event) =>
                  // Keep pointer focus on the rail; keyboard-style activation enters the section.
                  c.l1Id === "basic"
                    ? navigateToBasicSection(id, event.detail === 0)
                    : c.selectL2(id)
                }
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
          busy={packsBusy || c.loadingCapabilityPacks}
          progressText={c.packProgressText}
          installResult={c.packInstallResult}
          focusPackId={focusPackId}
          onOpenChange={(open) => {
            c.clearPackInstallResult()
            setPacksOpen(open)
          }}
          onRefresh={() => void c.refreshCapabilityPacks()}
          onInstall={(packId) => {
            setPacksBusy(true)
            void c.installCapabilityPack(packId).finally(() => setPacksBusy(false))
          }}
          onVerifyFail={
            showPackVerifyTestControl
              ? (packId) => {
                  setPacksBusy(true)
                  void c.installCapabilityPackVerifyFail(packId).finally(() => setPacksBusy(false))
                }
              : undefined
          }
          onUninstall={(packId) => {
            setPacksBusy(true)
            void c.uninstallCapabilityPack(packId).finally(() => setPacksBusy(false))
          }}
        />
        <DefaultsEditorDialog
          open={defaultsOpen}
          defaults={c.defaults}
          busy={defaultsBusy}
          error={defaultsError}
          onOpenChange={setDefaultsOpen}
          onSave={async (overrideData) => {
            setDefaultsBusy(true)
            try {
              return await c.saveDefaultsOverride(overrideData)
            } finally {
              setDefaultsBusy(false)
            }
          }}
          onReset={async () => {
            setDefaultsBusy(true)
            try {
              return await c.resetDefaults()
            } finally {
              setDefaultsBusy(false)
            }
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
        <span className="text-muted-foreground ml-2 text-[10px] font-bold tracking-wider uppercase">
          {t("networkProbe.badge.planning")}
        </span>
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

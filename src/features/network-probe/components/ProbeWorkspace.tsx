/**
 * Probe Workspace / 探测工作区: 按 L1/L2 挂载面板；只做路由，不含业务.
 *
 * 目录见 `probe-catalog.ts`；面板各自负责自己的展示，状态与编排在 controller。
 */
import { useMemo } from "react"
import { ArpPanel } from "@/features/network-probe/components/ArpPanel"
import { BasicView } from "@/features/network-probe/components/BasicView"
import { DnsLookupPanel } from "@/features/network-probe/components/DnsLookupPanel"
import { DnsSecPanel } from "@/features/network-probe/components/DnsSecPanel"
import { EgressPanel } from "@/features/network-probe/components/EgressPanel"
import { LanServicesPanel } from "@/features/network-probe/components/LanServicesPanel"
import { MtuPanel } from "@/features/network-probe/components/MtuPanel"
import { MultiNodePanel } from "@/features/network-probe/components/MultiNodePanel"
import { NatPanel } from "@/features/network-probe/components/NatPanel"
import { NtpPanel } from "@/features/network-probe/components/NtpPanel"
import {
  OfficialSitesPanel,
  OFFICIAL_PACK_ID,
} from "@/features/network-probe/components/OfficialSitesPanel"
import { PcapDiagPanel } from "@/features/network-probe/components/PcapDiagPanel"
import { PingPanel } from "@/features/network-probe/components/PingPanel"
import { PollutionPanel } from "@/features/network-probe/components/PollutionPanel"
import { PortScanPanel } from "@/features/network-probe/components/PortScanPanel"
import { ProbeTargetPanel } from "@/features/network-probe/components/ProbeTargetPanel"
import { SitesProbePanel } from "@/features/network-probe/components/SitesProbePanel"
import { SpeedPanel } from "@/features/network-probe/components/SpeedPanel"
import { TcpConnectPanel } from "@/features/network-probe/components/TcpConnectPanel"
import { TraceroutePanel } from "@/features/network-probe/components/TraceroutePanel"
import { WhoisPanel } from "@/features/network-probe/components/WhoisPanel"
import { ComingSoonPanel } from "@/features/network-probe/components/ComingSoonPanel"
import type { NetworkProbeController } from "@/features/network-probe/hooks/useNetworkProbeController"
import type { NetworkProbeL1Id } from "@/features/network-probe/probe-catalog"

/** 已有面板的 L1/L2 键；不在其中的落到「规划中」占位。安全项未授权时由页面上方的授权闸门拦住。 */
const IMPLEMENTED_KEYS = new Set([
  "sites/official",
  "sites/packs",
  "test/ping",
  "test/dns",
  "test/tcp",
  "test/custom",
  "test/traceroute",
  "test/mtu",
  "test/egress",
  "test/speed",
  "security/ports",
  "security/pollution",
  "security/dnssec",
  "security/whois",
  "security/pcap",
  "discover/arp",
  "discover/lan-svc",
  "discover/nat",
  "discover/ntp",
  "discover/nodes",
])

export function ProbeWorkspace({
  c,
  l1,
  l2,
  onManagePacks,
}: {
  c: NetworkProbeController
  l1: NetworkProbeL1Id
  l2: string
  onManagePacks: (packId?: string) => void
}) {
  const key = `${l1}/${l2}`
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
  const showComingSoon = l1 !== "basic" && !IMPLEMENTED_KEYS.has(key)

  return (
    <>
      {l1 === "basic" ? (
        <BasicView
          overview={{
            loading: c.loadingSummary,
            summary: c.summary,
            firewall: c.firewall,
            errors: c.overviewErrors,
            hostsSuspiciousCount: hostsSuspicious,
            onRefresh: c.refreshOverview,
            onOpenSettings: c.openSystemNetworkSettings,
          }}
          health={{
            loading: c.loadingHealth,
            result: c.healthResult,
            streamingItems: c.healthStreamingItems,
            canCancel: Boolean(c.activeSessionIdByKind.health),
            cancelling: c.healthCancelRequested,
            onRun: c.runHealthScan,
            onCancel: () => c.cancelScan("health"),
          }}
          offline={{
            loading: c.loadingOffline,
            loadingIpv6: c.loadingIpv6,
            loadingMtu: c.loadingMtu,
            loadingEgress: c.loadingOffline,
            focus: c.offlineSub,
            errors: c.offlineErrors,
            captive: c.captiveResult,
            publicIp: c.publicIpInfo,
            proxyVpn: c.proxyVpnStatus,
            ipv6: c.ipv6Result,
            mtu: c.mtuResult,
            onRunAll: c.runOfflineDiagnostics,
            onSelectFocus: c.selectOfflineSub,
            onCheckIpv6: c.checkIpv6Stack,
            onProbeMtu: c.probePathMtu,
            onRefreshEgress: c.refreshPublicIp,
            onOpenMtu: () => {
              c.selectL1("test")
              c.selectL2("mtu")
            },
            busy: c.loadingOffline || c.loadingIpv6 || c.loadingMtu,
          }}
          fix={{
            loading: c.loadingFix,
            services: c.networkServices,
            servicesStatus: c.networkServicesStatus,
            dnsPresets: c.defaults?.dnsPresets ?? [],
            lastResult: c.fixResult,
            onLoadServices: c.loadNetworkServices,
            onFlushDns: c.flushDns,
            onSwitchDns: c.switchDns,
            onRenewDhcp: c.renewDhcp,
            onResetNetworkStack: c.resetNetworkStack,
            onOpenSettings: c.openSystemNetworkSettings,
          }}
          report={{
            health: c.healthResult,
            history: c.reportHistory,
            commandLog: c.commandLog,
            onClearLog: c.clearCommandLog,
            onClearHistory: c.clearReportHistory,
          }}
        />
      ) : null}

      {key === "sites/packs" ? (
        <SitesProbePanel
          loading={c.loadingSites}
          canCancel={Boolean(c.activeSessionIdByKind.sites) && c.loadingSites}
          result={c.sitesResult}
          streaming={c.sitesStreaming}
          sparklines={c.siteSparklineByTarget}
          packIds={sitePackIds}
          toolEnabled={c.toolEnabled.sitesProbe}
          toolStatus={c.toolStatus.sitesProbe}
          onRunPack={c.runSitesProbe}
          onRunCustom={c.runSitesProbeCustom}
          onCancel={() => c.cancelScan("sites")}
        />
      ) : null}

      {key === "sites/official" ? (
        <OfficialSitesPanel
          loading={c.loadingSites}
          canCancel={Boolean(c.activeSessionIdByKind.sites) && c.loadingSites}
          presets={officialPresets}
          result={c.sitesResult}
          streaming={c.sitesStreaming}
          toolEnabled={c.toolEnabled.sitesProbe}
          toolStatus={c.toolStatus.sitesProbe}
          onTestAll={() => c.runSitesProbe(OFFICIAL_PACK_ID)}
          onTestOne={(target) => c.runSitesProbeCustom([target])}
          onCancel={() => c.cancelScan("sites")}
        />
      ) : null}

      {key === "test/ping" ? (
        <PingPanel
          loading={c.loadingPing}
          result={c.pingResult}
          toolEnabled={c.toolEnabled.ping}
          toolStatus={c.toolStatus.ping}
          errorCode={c.error?.code}
          onRun={c.runPing}
          onOpenLocalNetworkSettings={c.openLocalNetworkPrivacySettings}
        />
      ) : null}

      {key === "test/dns" ? (
        <DnsLookupPanel
          loading={c.loadingDns}
          result={c.dnsResult}
          dnsPresets={c.defaults?.dnsPresets}
          onRun={c.runDnsLookup}
        />
      ) : null}

      {key === "test/tcp" ? (
        <TcpConnectPanel loading={c.loadingTcp} result={c.tcpResult} onRun={c.runTcpConnect} />
      ) : null}

      {key === "test/custom" ? (
        <ProbeTargetPanel
          loading={c.loadingProbe}
          result={c.probeResult}
          onRun={c.runProbeTarget}
        />
      ) : null}

      {key === "test/traceroute" ? (
        <TraceroutePanel
          loading={c.loadingTraceroute}
          canCancel={Boolean(c.activeSessionIdByKind.traceroute) && c.loadingTraceroute}
          result={c.tracerouteResult}
          streamingHops={c.tracerouteStreamingHops}
          toolEnabled={c.toolEnabled.traceroute}
          toolStatus={c.toolStatus.traceroute}
          onRun={c.runTraceroute}
          onCancel={() => c.cancelScan("traceroute")}
        />
      ) : null}

      {key === "test/mtu" ? (
        <MtuPanel
          loading={c.loadingMtu}
          result={c.mtuResult}
          onRun={c.probePathMtu}
          dualFrom="test"
        />
      ) : null}

      {key === "test/egress" ? (
        <EgressPanel
          loading={c.loadingOffline}
          result={c.publicIpInfo}
          onRun={c.refreshPublicIp}
          dualFrom="test"
        />
      ) : null}

      {key === "test/speed" ? (
        <SpeedPanel
          loading={c.loadingSpeed}
          canCancel={c.loadingSpeed && Boolean(c.activeSessionIdByKind.speed)}
          sources={c.speedSources}
          result={c.speedResult}
          sample={c.speedSample}
          cooldownUntil={c.speedCooldownUntil}
          toolEnabled={c.toolEnabled.speedTest}
          toolStatus={c.toolStatus.speedTest}
          onLoadSources={c.loadSpeedSources}
          onRun={c.runSpeedTest}
          onCancel={() => c.cancelScan("speed")}
        />
      ) : null}

      {key === "security/ports" && c.securityAuthorized ? (
        <PortScanPanel
          loading={c.loadingPorts}
          canCancel={c.loadingPorts && Boolean(c.activeSessionIdByKind.ports)}
          result={c.portScanResult}
          streaming={c.portScanStreaming}
          toolEnabled={c.toolEnabled.portScan}
          toolStatus={c.toolStatus.portScan}
          fingerprintStatus={c.capabilities?.tools?.fingerprint}
          onRun={c.runPortScan}
          onCancel={() => c.cancelScan("ports")}
        />
      ) : null}

      {key === "security/pollution" && c.securityAuthorized ? (
        <PollutionPanel
          loading={c.loadingPollution}
          result={c.pollutionResult}
          toolEnabled={c.toolEnabled.pollution}
          toolStatus={c.toolStatus.pollution}
          onRun={c.runPollutionCheck}
        />
      ) : null}

      {key === "security/dnssec" && c.securityAuthorized ? (
        <DnsSecPanel
          loading={c.loadingDnssec}
          result={c.dnssecResult}
          toolEnabled={c.toolEnabled.dnssec}
          toolStatus={c.toolStatus.dnssec}
          onRun={c.runDnssec}
        />
      ) : null}

      {key === "security/whois" && c.securityAuthorized ? (
        <WhoisPanel
          loading={c.loadingWhois}
          result={c.whoisResult}
          toolEnabled={c.toolEnabled.whois}
          toolStatus={c.toolStatus.whois}
          onRun={c.runWhois}
        />
      ) : null}

      {key === "security/pcap" && c.securityAuthorized ? (
        <PcapDiagPanel
          loading={c.loadingPcap}
          result={c.pcapResult}
          toolEnabled={c.toolEnabled.pcap}
          toolStatus={c.toolStatus.pcap}
          canCancel={c.loadingPcap && Boolean(c.activeSessionIdByKind.pcap)}
          onRun={() => c.runPcapDiag(5)}
          onCancel={() => c.cancelScan("pcap")}
          onManagePacks={() => {
            onManagePacks("pcap-diag")
          }}
        />
      ) : null}

      {key === "discover/arp" ? (
        <ArpPanel
          loading={c.loadingLan}
          result={c.lanResult}
          toolEnabled={c.toolEnabled.arp}
          toolStatus={c.toolStatus.arp}
          canCancel={c.loadingLan && Boolean(c.activeSessionIdByKind.lan)}
          onRun={c.discoverLan}
          onCancel={() => c.cancelScan("lan")}
          onOpenLocalNetworkSettings={c.openLocalNetworkPrivacySettings}
        />
      ) : null}

      {key === "discover/lan-svc" ? (
        <LanServicesPanel
          loading={c.loadingLanServices}
          result={c.lanServicesResult}
          toolEnabled={c.toolEnabled.lanServices}
          toolStatus={c.toolStatus.lanServices}
          onRun={c.browseLanServices}
        />
      ) : null}

      {key === "discover/nat" ? (
        <NatPanel
          loading={c.loadingNat}
          result={c.natResult}
          toolEnabled={c.toolEnabled.nat}
          toolStatus={c.toolStatus.nat}
          onRun={c.probeNat}
        />
      ) : null}

      {key === "discover/ntp" ? (
        <NtpPanel
          loading={c.loadingNtp}
          result={c.ntpResult}
          toolEnabled={c.toolEnabled.ntp}
          toolStatus={c.toolStatus.ntp}
          onRun={c.probeNtp}
        />
      ) : null}

      {key === "discover/nodes" ? (
        <MultiNodePanel
          loading={c.loadingMultiNode}
          loadingNodes={c.loadingNodes}
          nodesLoadError={c.probeNodesLoadError}
          result={c.multiNodeDnsResult}
          globalpingResult={c.globalpingMeasurementResult}
          loadingGlobalping={c.loadingGlobalpingMeasurement}
          tokenConfigured={c.globalpingTokenConfigured}
          loadingToken={c.loadingGlobalpingToken}
          savingToken={c.savingGlobalpingToken}
          nodes={c.probeNodes}
          agentMutation={c.agentMutation}
          toolEnabled={c.toolEnabled.multiNode}
          toolStatus={c.toolStatus.multiNode}
          onCompare={c.compareDnsMulti}
          onRunGlobalping={c.runGlobalpingMeasurement}
          onRefreshTokenStatus={c.refreshGlobalpingTokenStatus}
          onSaveToken={c.saveGlobalpingToken}
          onRemoveToken={c.removeGlobalpingToken}
          onRefreshNodes={c.refreshProbeNodes}
          onAddAgent={c.addAgent}
          onRemoveAgent={c.removeAgent}
        />
      ) : null}

      {showComingSoon ? (
        <ComingSoonPanel
          l1={l1}
          l2={l2}
          toolStatus={c.capabilities?.tools}
          externalTools={c.capabilities?.externalTools}
          onManagePacks={onManagePacks}
        />
      ) : null}
    </>
  )
}

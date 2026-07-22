/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
import type { DefaultsOverride } from "@/lib/tauri/types/network-probe"
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import { invokeTauriCommand } from "@/lib/tauri/invoke"

export function getNetworkProbeCapabilities() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.getCapabilities)
}

export function listProbeNodes() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.listProbeNodes)
}

export function getNetworkProbeDefaults() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.getDefaults)
}

export function saveDefaultsOverride(overrideData: DefaultsOverride) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.saveDefaultsOverride, { overrideData })
}

export function resetNetworkProbeDefaults() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.resetDefaults)
}

export function listCapabilityPacks() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.listCapabilityPacks)
}

export function installCapabilityPack(packId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.installCapabilityPack, { packId })
}

export function uninstallCapabilityPack(packId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.uninstallCapabilityPack, { packId })
}

export function getLocalNetworkSummary() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.getLocalNetworkSummary)
}

export function getDefaultRoute() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.getDefaultRoute)
}

export function tcpConnect(host: string, port: number, timeoutMs?: number) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.tcpConnect, {
    host,
    port,
    timeoutMs: timeoutMs ?? null,
  })
}

export function probePingHost(target: string, count?: number, intervalMs?: number) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.pingHost, {
    target,
    count: count ?? null,
    intervalMs: intervalMs ?? null,
  })
}

export function probeDnsLookup(domain: string, rrType?: string, resolver?: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.dnsLookup, {
    domain,
    rrType: rrType ?? null,
    resolver: resolver ?? null,
  })
}

export function probeTarget(input: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.probeTarget, { input })
}

export function sitesProbe(packId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.sitesProbe, { packId })
}

export function sitesProbeCustom(targets: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.sitesProbeCustom, { targets })
}

export function runHealthScan() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.runHealthScan)
}

export function cancelScan(sessionId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.cancelScan, { sessionId })
}

export function listNetworkServices() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.listNetworkServices)
}

export function flushDns() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.flushDns)
}

export function switchDns(service: string, servers: string[]) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.switchDns, { service, servers })
}

export function renewDhcp(service: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.renewDhcp, { service })
}

export function resetNetworkStack(service: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.resetNetworkStack, { service })
}

export function detectCaptivePortal() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.detectCaptivePortal)
}

export function getPublicIpInfo() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.getPublicIpInfo)
}

export function getProxyVpnStatus() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.getProxyVpnStatus)
}

export function runTraceroute(target: string, maxTtl?: number, rounds?: number) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.runTraceroute, {
    target,
    maxTtl: maxTtl ?? null,
    rounds: rounds ?? null,
  })
}

export function checkIpv6Stack() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.checkIpv6Stack)
}

export function probePathMtu(target: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.probePathMtu, { target })
}

export function checkHostsOverrides() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.checkHostsOverrides)
}

export function getFirewallStatus() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.getFirewallStatus)
}

export function openSystemNetworkSettings() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.openSystemNetworkSettings)
}

export function listSpeedSources() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.listSpeedSources)
}

export function runSpeedTest(sourceId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.runSpeedTest, { sourceId })
}

export function runPollutionCheck(domain: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.runPollutionCheck, { domain })
}

export function whoisLookup(query: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.whois, { query })
}

export function checkDnssec(domain: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.checkDnssec, { domain })
}

export function scanPorts(target: string, ports: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.scanPorts, { target, ports })
}

export function probeNat() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.probeNat)
}

export function probeNtp() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.probeNtp)
}

export function discoverLan() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.discoverLan)
}

export function browseLanServices() {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.browseLanServices)
}

export function runPcapDiag(durationSecs?: number | null) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.runPcapDiag, { durationSecs })
}

export function compareDnsMulti(domain: string, locations?: string[] | null) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.compareDnsMulti, { domain, locations })
}

export function addAgent(label: string, endpoint: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.addAgent, { label, endpoint })
}

export function removeAgent(agentId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.removeAgent, { agentId })
}

export function rejectAgentAction(action: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.rejectAgentAction, { action })
}

export function installCapabilityPackVerifyFail(packId: string) {
  return invokeTauriCommand(TAURI_COMMANDS.networkProbe.installCapabilityPackVerifyFail, {
    packId,
  })
}

/**
 * IPC Commands / 通信命令: wrap typed invokes only; 只封装 Tauri 调用.
 */
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

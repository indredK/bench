/**
 * Repository / 仓储: adapt IPC boundary; 只做 IPC 适配.
 */
import * as commands from "@/lib/tauri/commands/network-probe"

export const networkProbeRepository = {
  getCapabilities: commands.getNetworkProbeCapabilities,
  listProbeNodes: commands.listProbeNodes,
  getDefaults: commands.getNetworkProbeDefaults,
  getLocalNetworkSummary: commands.getLocalNetworkSummary,
  getDefaultRoute: commands.getDefaultRoute,
  tcpConnect: commands.tcpConnect,
  pingHost: commands.probePingHost,
  dnsLookup: commands.probeDnsLookup,
  probeTarget: commands.probeTarget,
  sitesProbe: commands.sitesProbe,
  sitesProbeCustom: commands.sitesProbeCustom,
  runHealthScan: commands.runHealthScan,
  cancelScan: commands.cancelScan,
  listNetworkServices: commands.listNetworkServices,
  flushDns: commands.flushDns,
  switchDns: commands.switchDns,
  renewDhcp: commands.renewDhcp,
  resetNetworkStack: commands.resetNetworkStack,
  detectCaptivePortal: commands.detectCaptivePortal,
  getPublicIpInfo: commands.getPublicIpInfo,
  getProxyVpnStatus: commands.getProxyVpnStatus,
  runTraceroute: commands.runTraceroute,
  checkIpv6Stack: commands.checkIpv6Stack,
  probePathMtu: commands.probePathMtu,
  checkHostsOverrides: commands.checkHostsOverrides,
  getFirewallStatus: commands.getFirewallStatus,
  openSystemNetworkSettings: commands.openSystemNetworkSettings,
}

/**
 * Probe Catalog / 探测目录: L1 → L2 的唯一清单（纯数据，无 UI）.
 *
 * 产品地图（用户视角的四个问题）：
 * - basic    「我断网了吗？」  急救：概览 / 健康树 / 判断 / 离线诊断 / 修复 / 报告
 * - sites    「某个网站能连吗？」常用站点与站点包的可达性与延迟
 * - test     「这条链路哪里慢/断？」主动探测：ping / DNS / TCP / traceroute / MTU / 出口 / 测速
 * - security 「我这台机器暴露了什么？」端口 / 污染 / 抓包 / DNSSEC / WHOIS（需先授权）
 * - discover 「局域网与多节点里有什么？」ARP / 局域网服务 / NAT / NTP / 多节点
 * 新增探测先在这里登记，再在 ProbeWorkspace 里挂面板。
 */
import type { NetworkProbeL1 } from "@/features/network-probe/store"

export type NetworkProbeL1Id = NetworkProbeL1

export const L1_IDS: NetworkProbeL1Id[] = ["basic", "sites", "test", "security", "discover"]

export const L2_BY_L1: Record<NetworkProbeL1Id, string[]> = {
  basic: ["overview", "tree", "opinion", "offline", "fix", "report"],
  sites: ["official", "packs"],
  test: ["ping", "dns", "tcp", "custom", "traceroute", "mtu", "egress", "speed"],
  security: ["ports", "pollution", "pcap", "dnssec", "whois"],
  discover: ["arp", "lan-svc", "nat", "ntp", "nodes"],
}

/** Post-MVP 能力：L2 标签上显示「后续」角标。 */
export const POST_L2 = new Set([
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

/** 需要先装能力包才能用的 L2 → 对应能力包 id。 */
export const L2_PACK_HINT: Record<string, string> = {
  ports: "adv-scanner",
  pcap: "pcap-diag",
  arp: "adv-scanner",
}

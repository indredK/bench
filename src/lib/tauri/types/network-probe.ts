/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export interface ProbeNode {
  id: string
  kind: string
  label: string
  reachable: boolean
  endpoint?: string
  region?: string
  capabilities?: string[]
}

export interface NetworkProbeCapabilities {
  platform: string
  privilegeLevel: string
  tools: Record<string, string>
  packs?: Record<string, string>
  externalTools?: Record<string, string>
}

export interface CapabilityPackInfo {
  id: string
  version: string
  sizeBytes: number
  status: string
  descriptionKey: string
  artifactReady: boolean
  installedAtMs?: number
  installMode?: string
}

export interface CapabilityPackInstallResult {
  packId: string
  ok: boolean
  mode: string
  message: string
  commandHint: string
}

export interface CapabilityPackProgress {
  packId: string
  phase: string
  bytes: number
  totalBytes: number
}

export interface DefaultsOverride {
  dnsPresets?: { id: string; address: string; region: string }[]
  sitePacks?: Record<string, { id: string; target: string; channel: string }[]>
  reachTargets?: { id: string; kind: string; target: string }[]
  captiveProbes?: { id: string; url: string; expectStatus: number }[]
  publicIpApis?: { id: string; url: string; format: string }[]
  mtuTargets?: { id: string; target: string }[]
}

export interface NetworkInterfaceInfo {
  name: string
  addrs: string[]
  isLoopback: boolean
}

export interface LocalNetworkSummary {
  interfaces: NetworkInterfaceInfo[]
  primaryIpv4?: string
  primaryIpv6?: string
  gateway?: string
  dnsServers: string[]
  wifiSsid?: string
  wifiSignalDbm?: number
  unavailableFields?: NetworkSummaryField[]
}

export type NetworkSummaryField = "gateway" | "dnsServers" | "wifi"

export interface DefaultRouteInfo {
  gateway?: string
  interface?: string
  present: boolean
}

export interface TcpConnectResult {
  host: string
  port: number
  status: string
  rttMs?: number
  message?: string
  commandHint: string
}

export interface PingSample {
  seq: number
  ok: boolean
  rttMs?: number
  error?: "timeout" | "permission_denied" | "network_error"
}

export interface PingProbeResult {
  target: string
  resolvedIp: string
  packetsSent: number
  packetsReceived: number
  lossPercent: number
  minRttMs?: number
  avgRttMs?: number
  maxRttMs?: number
  stddevRttMs?: number
  samples: PingSample[]
  sessionId: string
  cancelled: boolean
  commandHint: string
}

export interface PingSampleEvent {
  sessionId: string
  sample: PingSample
}

export interface SpeedSource {
  id: string
  name: string
  baseUrl: string
  dlPath: string
  ulPath: string
  pingPath: string
  maxUploadMb: number
}

export interface SpeedSampleEvent {
  phase: string
  value: number
  detail: string
}

export interface SpeedTestResult {
  sourceId: string
  sourceName: string
  pingMs?: number
  jitterMs?: number
  downloadMbps?: number
  uploadMbps?: number
  ok: boolean
  cancelled: boolean
  sessionId: string
  message?: string
  commandHint: string
}

export interface DnsRecordItem {
  name: string
  rrType: string
  ttl: number
  data: string
}

export interface DnsLookupResult {
  domain: string
  rrType: string
  resolver: string
  elapsedMs: number
  records: DnsRecordItem[]
  commandHint: string
}

export interface IcmpProbeDetail {
  ok: boolean
  rttMs?: number
  resolvedIp?: string
  error?: string
}

export interface HttpProbeDetail {
  ok: boolean
  status?: number
  ttfbMs?: number
  finalUrl?: string
  downloadMbps?: number
  downloadBytes?: number
  error?: string
}

export interface TlsLightDetail {
  present: boolean
  handshakeOk: boolean
  detail?: string
}

export interface ProbeTargetResult {
  input: string
  kind: string
  icmp?: IcmpProbeDetail
  http?: HttpProbeDetail
  tls?: TlsLightDetail
  commandHint: string
}

export interface SiteSampleResult {
  id: string
  target: string
  channel: string
  ok: boolean
  degraded?: boolean
  icmpRttMs?: number
  httpStatus?: number
  httpTtfbMs?: number
  downloadMbps?: number
  downloadBytes?: number
  error?: string
}

export interface SitesProbeResult {
  packId: string
  results: SiteSampleResult[]
  sessionId: string
  cancelled: boolean
  commandHint: string
}

export interface HealthCheckItem {
  key: string
  layer: string
  status: string
  detail?: string
  commandHint?: string
}

export interface HealthOpinion {
  id: string
  severity: string
  relatedKeys: string[]
  titleKey: string
  bodyKey: string
}

export interface HealthScanResult {
  items: HealthCheckItem[]
  opinions: HealthOpinion[]
  elapsedMs: number
  sessionId: string
  cancelled: boolean
  commandHint: string
}

export interface ScanSessionEvent {
  sessionId: string
  kind: string
}

export interface FixResult {
  action: string
  ok: boolean
  message: string
  commandHint: string
}

export interface CaptivePortalResult {
  status: string
  detail?: string
  commandHint: string
}

export interface PublicIpInfo {
  ip?: string
  source?: string
  asn?: string
  org?: string
  detail?: string
  commandHint: string
}

export interface ProxyVpnStatus {
  proxyEnabled: boolean
  proxyStatusKnown: boolean
  proxyDetail?: string
  vpnInterfacesKnown: boolean
  vpnIfaces: string[]
  defaultRouteKnown: boolean
  defaultViaTunnel: boolean
  commandHint: string
}

export interface TracerouteHop {
  ttl: number
  addrs: string[]
  lossPercent: number
  avgRttMs?: number
  bestRttMs?: number
  worstRttMs?: number
  sent: number
  recv: number
  asn?: string
  asName?: string
}

export interface TracerouteResult {
  target: string
  resolvedIp: string
  privilegeMode: string
  hops: TracerouteHop[]
  rounds: number
  elapsedMs: number
  message?: string
  sessionId: string
  cancelled: boolean
  commandHint: string
}

export interface Ipv6DualStackCompare {
  ipv4Ok: boolean
  ipv6Ok: boolean
  ipv4RttMs?: number
  ipv6RttMs?: number
  detail: string
}

export interface Ipv6StackResult {
  status: string
  linkLocal: string[]
  global: string[]
  aaaaOk: boolean
  aaaaAddrs: string[]
  icmpv6Ok?: boolean
  icmpv6RttMs?: number
  httpV6Ok?: boolean
  dualStack: Ipv6DualStackCompare
  ndpStatus: string
  ndpDetail?: string
  tracerouteNote?: string
  message?: string
  elapsedMs: number
  commandHint: string
}

export interface PathMtuProbeStep {
  payloadBytes: number
  ok: boolean
  detail?: string
}

export interface PathMtuResult {
  target: string
  resolvedIp: string
  status: string
  pathMtu?: number
  maxPayload?: number
  method: string
  steps: PathMtuProbeStep[]
  message?: string
  elapsedMs: number
  commandHint: string
}

export interface HostsOverride {
  address: string
  names: string[]
  line: number
  suspicious: boolean
}

export interface FirewallStatus {
  status: string
  detail?: string
}

export interface DnsPreset {
  id: string
  address: string
  region: string
}

export interface ReachTarget {
  id: string
  kind: string
  target: string
}

export interface CaptiveProbe {
  id: string
  url: string
  expectStatus: number
}

export interface PublicIpApi {
  id: string
  url: string
  format: string
}

export interface SitePreset {
  id: string
  target: string
  channel: string
}

export interface MtuTarget {
  id: string
  target: string
}

export interface NetworkProbeDefaultsCatalog {
  schemaVersion: number
  dnsPresets: DnsPreset[]
  reachTargets: ReachTarget[]
  captiveProbes: CaptiveProbe[]
  publicIpApis: PublicIpApi[]
  sitePacks: Record<string, SitePreset[]>
  mtuTargets: MtuTarget[]
}

export interface PollutionFinding {
  code: string
  kind: string
  severity: string
  evidence: string
  commandHint: string
}

export interface PollutionReport {
  domain: string
  findings: PollutionFinding[]
  elapsedMs: number
  commandHint: string
}

export interface WhoisInfo {
  query: string
  source: string
  rawText: string
  partial: boolean
  message?: string
  commandHint: string
}

export interface DnsSecCheckResult {
  domain: string
  dnssecStatus: string
  dnssecDetail?: string
  dohOk: boolean
  dohRttMs?: number
  dohDetail?: string
  dotOk: boolean
  dotRttMs?: number
  dotDetail?: string
  commandHint: string
}

export interface PortSampleEvent {
  port: number
  state: string
  serviceHint?: string
  rttMs?: number
}

export interface PortScanResult {
  target: string
  mode: string
  openPorts: number[]
  samples: PortSampleEvent[]
  cancelled: boolean
  sessionId: string
  message?: string
  commandHint: string
}

export interface NatProbeResult {
  natType: string
  mappedAddress?: string
  stunServer: string
  detail?: string
  elapsedMs: number
  commandHint: string
}

export interface NtpProbeResult {
  server: string
  ok: boolean
  offsetSeconds?: number
  rttSeconds?: number
  severity: string
  detail?: string
  elapsedMs: number
  commandHint: string
}

export interface ArpNeighbor {
  ip: string
  mac?: string
  iface?: string
  source: string
}

export interface LanDiscoveryProgressEvent {
  sessionId: string
  phase: "preparing" | "scanning"
  checkedHosts: number
  totalHosts: number
  discoveredNeighbors: number
}

export interface LanDiscoveryResult {
  mode: string
  neighbors: ArpNeighbor[]
  message?: string
  emptyReason?: string
  cidr?: string
  cancelled: boolean
  sessionId: string
  elapsedMs: number
  commandHint: string
}

export interface LanServiceItem {
  protocol: string
  name: string
  serviceType?: string
  host?: string
  port?: number
  detail: string
}

export interface LanServicesResult {
  items: LanServiceItem[]
  cancelled: boolean
  sessionId: string
  message?: string
  elapsedMs: number
  commandHint: string
}

export interface LanServicesProgressEvent {
  sessionId: string
  phase: "preparing" | "mdns" | "ssdp"
  discoveredServices: number
}

export interface PcapDiagResult {
  mode: string
  packets: number
  tcpRst: number
  retransHint: number
  outOfOrderHint: number
  cancelled: boolean
  sessionId: string
  message?: string
  elapsedMs: number
  commandHint: string
}

export interface NodeDnsAnswer {
  nodeId: string
  nodeLabel: string
  ok: boolean
  answers: string[]
  detail?: string
  failureKind?:
    "quota" | "timeout" | "request" | "auth" | "credentialStore" | "measurement" | "noAnswers"
  rateLimit?: {
    limit?: number
    consumed?: number
    remaining?: number
    waitSeconds?: number
    creditsConsumed?: number
    creditsRemaining?: number
    requestCost?: number
  }
}

export interface MultiNodeDnsResult {
  domain: string
  answers: NodeDnsAnswer[]
  elapsedMs: number
  sessionId: string
  cancelled: boolean
  commandHint: string
}

export interface GlobalpingMeasurementResult {
  target: string
  measurementType: "ping" | "http"
  probes: GlobalpingProbeMeasurement[]
  elapsedMs: number
  sessionId: string
  cancelled: boolean
  commandHint: string
}

export interface GlobalpingProbeMeasurement {
  nodeId: string
  nodeLabel: string
  status: string
  failureKind?: string
  detail?: string
  resolvedAddress?: string
  pingStats?: {
    minRttMs?: number
    avgRttMs?: number
    maxRttMs?: number
    lossPercent?: number
    packetsSent?: number
    packetsReceived?: number
  }
  httpStatusCode?: number
  httpStatusName?: string
  httpTimings?: {
    totalMs: number
    dnsMs?: number
    tcpMs: number
    tlsMs?: number
    firstByteMs: number
    downloadMs: number
  }
  rateLimit?: {
    limit?: number
    consumed?: number
    remaining?: number
    waitSeconds?: number
    creditsConsumed?: number
    creditsRemaining?: number
    requestCost?: number
  }
}

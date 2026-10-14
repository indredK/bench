import { describe, expect, it } from "vitest"
import { isNetworkProbeErrorVisible } from "@/features/network-probe/error-scope"

describe("network-probe error panel scope", () => {
  it("keeps a Ping failure off the DNS panel", () => {
    const error = { key: "networkProbe.errors.pingFailed" }

    expect(isNetworkProbeErrorVisible(error, "test", "ping", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(error, "test", "dns", "all")).toBe(false)
  })

  it("keeps ICMP permission guidance on the Ping panel", () => {
    const error = { key: "networkProbe.errors.icmpUnavailable" }

    expect(isNetworkProbeErrorVisible(error, "test", "ping", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(error, "test", "dns", "all")).toBe(false)
  })

  it("keeps cancel failures with the session kind that failed", () => {
    const error = { key: "networkProbe.errors.cancelFailed", scope: "traceroute" as const }
    const pingError = { key: "networkProbe.errors.cancelFailed", scope: "ping" as const }

    expect(isNetworkProbeErrorVisible(error, "test", "traceroute", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(error, "security", "ports", "all")).toBe(false)
    expect(isNetworkProbeErrorVisible(pingError, "test", "ping", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(pingError, "test", "dns", "all")).toBe(false)
  })

  it("limits offline subtool errors to the matching subview", () => {
    const error = { key: "networkProbe.errors.ipv6Failed" }

    expect(isNetworkProbeErrorVisible(error, "basic", "offline", "ipv6")).toBe(true)
    expect(isNetworkProbeErrorVisible(error, "basic", "offline", "egress")).toBe(false)
  })

  it("keeps capability and packet-capture errors on their owning panels", () => {
    const packError = { key: "networkProbe.errors.packsFailed" }
    const pcapError = { key: "networkProbe.errors.pcapFailed" }

    expect(isNetworkProbeErrorVisible(packError, "sites", "packs", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(packError, "security", "pcap", "all")).toBe(false)
    expect(isNetworkProbeErrorVisible(pcapError, "security", "pcap", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(pcapError, "sites", "packs", "all")).toBe(false)
  })

  it("keeps unclassified module-level errors visible", () => {
    const error = { key: "networkProbe.errors.bootstrapFailed" }

    expect(isNetworkProbeErrorVisible(error, "test", "dns", "all")).toBe(true)
  })
})

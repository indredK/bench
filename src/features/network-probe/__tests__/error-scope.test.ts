import { describe, expect, it } from "vitest"
import { isNetworkProbeErrorVisible } from "@/features/network-probe/error-scope"
import { useNetworkProbeStore } from "@/features/network-probe/store"

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

  it("keeps DNS resolution failures on the Ping panel", () => {
    const error = { key: "networkProbe.errors.pingDnsResolutionFailed" }

    expect(isNetworkProbeErrorVisible(error, "test", "ping", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(error, "test", "dns", "all")).toBe(false)
  })

  it("keeps cancel failures with the session kind that failed", () => {
    const error = { key: "networkProbe.errors.cancelFailed", scope: "traceroute" as const }
    const pingError = { key: "networkProbe.errors.cancelFailed", scope: "ping" as const }
    const lanServicesError = {
      key: "networkProbe.errors.cancelFailed",
      scope: "lanServices" as const,
    }

    expect(isNetworkProbeErrorVisible(error, "test", "traceroute", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(error, "security", "ports", "all")).toBe(false)
    expect(isNetworkProbeErrorVisible(pingError, "test", "ping", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(pingError, "test", "dns", "all")).toBe(false)
    expect(isNetworkProbeErrorVisible(lanServicesError, "discover", "lan-svc", "all")).toBe(true)
    expect(isNetworkProbeErrorVisible(lanServicesError, "discover", "arp", "all")).toBe(false)
  })

  it("limits offline subtool errors to the matching subview", () => {
    const error = { key: "networkProbe.errors.ipv6Failed" }

    expect(isNetworkProbeErrorVisible(error, "basic", "offline", "ipv6")).toBe(true)
    expect(isNetworkProbeErrorVisible(error, "basic", "offline", "egress")).toBe(false)
  })

  it("keeps all integrated BasicView section errors visible, but excludes other L1 errors", () => {
    for (const key of [
      "networkProbe.errors.overviewFailed",
      "networkProbe.errors.healthFailed",
      "networkProbe.errors.servicesFailed",
      "networkProbe.errors.fixFailed",
      "networkProbe.errors.ipv6Failed",
      "networkProbe.errors.mtuFailed",
      "networkProbe.errors.offlineFailed",
    ]) {
      expect(isNetworkProbeErrorVisible({ key }, "basic", "integrated", "all")).toBe(true)
    }
    expect(
      isNetworkProbeErrorVisible(
        { key: "networkProbe.errors.pingFailed" },
        "basic",
        "integrated",
        "all",
      ),
    ).toBe(false)
  })

  it("does not discard a BasicView section failure based on the last selected anchor", () => {
    const previous = useNetworkProbeStore.getState()
    const nav = {
      ...previous.nav,
      l1Id: "basic" as const,
      l2ByL1: { ...previous.nav.l2ByL1, basic: "overview" },
    }

    useNetworkProbeStore.setState({ nav, error: null })
    try {
      useNetworkProbeStore.getState().setError({
        key: "networkProbe.errors.fixFailed",
        fallback: "Fix failed",
      })
      expect(useNetworkProbeStore.getState().error).toMatchObject({
        key: "networkProbe.errors.fixFailed",
        fallback: "Fix failed",
      })
    } finally {
      useNetworkProbeStore.setState({ nav: previous.nav, error: previous.error })
    }
  })

  it("preserves the error banner when scroll tracking updates the BasicView anchor", () => {
    const previous = useNetworkProbeStore.getState()
    const nav = {
      ...previous.nav,
      l1Id: "basic" as const,
      l2ByL1: { ...previous.nav.l2ByL1, basic: "overview" },
    }

    useNetworkProbeStore.setState({ nav, error: null })
    try {
      const store = useNetworkProbeStore.getState()
      store.setError({ key: "networkProbe.errors.fixFailed", fallback: "Fix failed" })
      store.setL2("offline", { preserveError: true })

      expect(useNetworkProbeStore.getState().nav.l2ByL1.basic).toBe("offline")
      expect(useNetworkProbeStore.getState().error).toMatchObject({
        key: "networkProbe.errors.fixFailed",
        fallback: "Fix failed",
      })

      useNetworkProbeStore.getState().setL2("fix")
      expect(useNetworkProbeStore.getState().error).toBeNull()
    } finally {
      useNetworkProbeStore.setState({ nav: previous.nav, error: previous.error })
    }
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

  it("keeps agent registry recovery errors visible during bootstrap on every panel", () => {
    const error = { key: "networkProbe.errors.agentRegistryLimitExceeded" }

    expect(isNetworkProbeErrorVisible(error, "basic", "overview", "all")).toBe(true)
  })

  it("preserves a visible TCP failure when a late DNS failure arrives", () => {
    const previous = useNetworkProbeStore.getState()
    const nav = {
      ...previous.nav,
      l1Id: "test" as const,
      l2ByL1: { ...previous.nav.l2ByL1, test: "tcp" },
    }

    useNetworkProbeStore.setState({ nav, error: null })

    try {
      const store = useNetworkProbeStore.getState()
      store.setError({ key: "networkProbe.errors.tcpFailed", fallback: "Connection refused" })
      store.setError({ key: "networkProbe.errors.dnsFailed", fallback: "DNS timeout" })

      expect(useNetworkProbeStore.getState().error).toMatchObject({
        key: "networkProbe.errors.tcpFailed",
        fallback: "Connection refused",
      })
    } finally {
      useNetworkProbeStore.setState({ nav: previous.nav, error: previous.error })
    }
  })
})

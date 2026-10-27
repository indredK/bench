import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  runPollutionCheck,
  whoisLookup,
  checkDnssec,
  probeNat,
  probeNtp,
  discoverLan,
  browseLanServices,
  runPcapDiag,
  compareDnsMulti,
  listenToPlatformEvent,
} = vi.hoisted(() => ({
  runPollutionCheck: vi.fn(),
  whoisLookup: vi.fn(),
  checkDnssec: vi.fn(),
  probeNat: vi.fn(),
  probeNtp: vi.fn(),
  discoverLan: vi.fn(),
  browseLanServices: vi.fn(),
  runPcapDiag: vi.fn(),
  compareDnsMulti: vi.fn(),
  listenToPlatformEvent: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    runPollutionCheck,
    whoisLookup,
    checkDnssec,
    probeNat,
    probeNtp,
    discoverLan,
    browseLanServices,
    runPcapDiag,
    compareDnsMulti,
  },
}))

vi.mock("@/platform/events", () => ({ listenToPlatformEvent }))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

const cases = [
  {
    name: "pollution check",
    mock: runPollutionCheck,
    seed: () => useNetworkProbeStore.getState().setPollutionResult({} as never),
    result: () => useNetworkProbeStore.getState().pollutionResult,
    run: () => networkProbeUseCases.runPollutionCheck("example.com"),
  },
  {
    name: "WHOIS lookup",
    mock: whoisLookup,
    seed: () => useNetworkProbeStore.getState().setWhoisResult({} as never),
    result: () => useNetworkProbeStore.getState().whoisResult,
    run: () => networkProbeUseCases.runWhois("example.com"),
  },
  {
    name: "DNSSEC check",
    mock: checkDnssec,
    seed: () => useNetworkProbeStore.getState().setDnssecResult({} as never),
    result: () => useNetworkProbeStore.getState().dnssecResult,
    run: () => networkProbeUseCases.runDnssec("example.com"),
  },
  {
    name: "NAT probe",
    mock: probeNat,
    seed: () => useNetworkProbeStore.getState().setNatResult({} as never),
    result: () => useNetworkProbeStore.getState().natResult,
    run: () => networkProbeUseCases.probeNat(),
  },
  {
    name: "NTP probe",
    mock: probeNtp,
    seed: () => useNetworkProbeStore.getState().setNtpResult({} as never),
    result: () => useNetworkProbeStore.getState().ntpResult,
    run: () => networkProbeUseCases.probeNtp(),
  },
  {
    name: "LAN discovery",
    mock: discoverLan,
    seed: () => useNetworkProbeStore.getState().setLanResult({} as never),
    result: () => useNetworkProbeStore.getState().lanResult,
    run: () => networkProbeUseCases.discoverLan(),
  },
  {
    name: "LAN service discovery",
    mock: browseLanServices,
    seed: () => useNetworkProbeStore.getState().setLanServicesResult({} as never),
    result: () => useNetworkProbeStore.getState().lanServicesResult,
    run: () => networkProbeUseCases.browseLanServices(),
  },
  {
    name: "packet capture diagnostics",
    mock: runPcapDiag,
    seed: () => useNetworkProbeStore.getState().setPcapResult({} as never),
    result: () => useNetworkProbeStore.getState().pcapResult,
    run: () => networkProbeUseCases.runPcapDiag(),
  },
  {
    name: "multi-node DNS comparison",
    mock: compareDnsMulti,
    seed: () => useNetworkProbeStore.getState().setMultiNodeDnsResult({} as never),
    result: () => useNetworkProbeStore.getState().multiNodeDnsResult,
    run: () => networkProbeUseCases.compareDnsMulti("example.com"),
  },
]

beforeEach(() => {
  for (const scenario of cases) {
    scenario.mock.mockReset().mockRejectedValue(new Error("probe failed"))
  }
  listenToPlatformEvent.mockReset().mockResolvedValue(() => {})
  useNetworkProbeStore.getState().setSecurityAuthorized(true)
  useNetworkProbeStore.getState().setError(null)
  useNetworkProbeStore.setState({ commandLog: [] })
})

describe("network-probe secondary single-run result state", () => {
  it.each(cases)("clears stale $name results before a retry", async (scenario) => {
    scenario.seed()
    expect(scenario.result()).not.toBeNull()

    const run = scenario.run()
    expect(scenario.result()).toBeNull()

    await run
    expect(scenario.result()).toBeNull()
    expect(useNetworkProbeStore.getState().commandLog.at(-1)).toMatch(/ failed$/)
  })

  it("maps pcap permission failures to an actionable localized error", async () => {
    runPcapDiag.mockRejectedValueOnce({
      code: "PCAP_PRIVILEGE",
      message: "Permission denied",
    })

    await networkProbeUseCases.runPcapDiag()

    expect(useNetworkProbeStore.getState().error?.key).toBe(
      "networkProbe.errors.pcapPermissionRequired",
    )
  })

  it("records a cancelled pcap sample as cancelled rather than complete", async () => {
    runPcapDiag.mockResolvedValueOnce({
      mode: "unavailable",
      packets: 0,
      tcpRst: 0,
      retransHint: 0,
      outOfOrderHint: 0,
      cancelled: true,
      sessionId: "pcap-session",
      message: "Capture cancelled.",
      elapsedMs: 20,
      commandHint: "startPacketCapture(local)",
    })

    await networkProbeUseCases.runPcapDiag()

    expect(useNetworkProbeStore.getState().pcapResult?.cancelled).toBe(true)
    expect(useNetworkProbeStore.getState().commandLog.at(-1)).toMatch(/cancelled/)
    expect(useNetworkProbeStore.getState().commandLog.at(-1)).not.toMatch(/ done /)
  })
})

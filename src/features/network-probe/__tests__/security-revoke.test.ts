import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { scanPorts, runPcapDiag, cancelScan, runPollutionCheck, whoisLookup, checkDnssec } =
  vi.hoisted(() => ({
    scanPorts: vi.fn(),
    runPcapDiag: vi.fn(),
    cancelScan: vi.fn(),
    runPollutionCheck: vi.fn(),
    whoisLookup: vi.fn(),
    checkDnssec: vi.fn(),
  }))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    scanPorts,
    runPcapDiag,
    cancelScan,
    runPollutionCheck,
    whoisLookup,
    checkDnssec,
  },
}))

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(
    async (event: string, handler: (event: { payload: unknown }) => void) => {
      let eventHandlers = handlers.get(event)
      if (!eventHandlers) {
        eventHandlers = new Set()
        handlers.set(event, eventHandlers)
      }
      eventHandlers.add(handler)
      return () => eventHandlers?.delete(handler)
    },
  ),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function emitScanSession(payload: { sessionId: string; kind: string }) {
  act(() => {
    handlers.get(TAURI_EVENTS.networkProbe.scanSession)?.forEach((handler) => handler({ payload }))
  })
}

const portScanResult = {
  sessionId: "ports-1",
  target: "127.0.0.1",
  cancelled: false,
  openPorts: [80],
  samples: [],
  mode: "tcp-connect",
  message: "scan completed",
  commandHint: "",
}

const pcapResult = {
  sessionId: "pcap-1",
  cancelled: false,
  available: true,
  retransmissions: 0,
  outOfOrder: 0,
  resets: 0,
  mode: "synthetic",
  message: "capture completed",
  commandHint: "",
}

beforeEach(() => {
  handlers.clear()
  scanPorts.mockReset()
  runPcapDiag.mockReset()
  cancelScan.mockReset().mockResolvedValue(true)
  runPollutionCheck.mockReset()
  whoisLookup.mockReset()
  checkDnssec.mockReset()
  useNetworkProbeStore.setState({
    securityAuthorized: true,
    securityAuthorizationRevision: 0,
    loadingPollution: false,
    loadingWhois: false,
    loadingDnssec: false,
    loadingPorts: false,
    loadingPcap: false,
    pollutionResult: null,
    whoisResult: null,
    dnssecResult: null,
    portScanResult: null,
    portScanStreaming: [],
    pcapResult: null,
    activeSessionIdByKind: {
      health: null,
      sites: null,
      ping: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
    cancelRequestedSessionIdByKind: {
      health: null,
      sites: null,
      ping: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
    errors: [],
    error: null,
    commandLog: [],
  })
})

describe("network probe security authorization revoke", () => {
  it("cancels an active port scan and ignores its result after revoke", async () => {
    const scan = deferred<typeof portScanResult>()
    const capture = deferred<typeof pcapResult>()
    scanPorts.mockReturnValue(scan.promise)
    runPcapDiag.mockReturnValue(capture.promise)

    const scanPromise = networkProbeUseCases.runPortScan("127.0.0.1", "80")
    const capturePromise = networkProbeUseCases.runPcapDiag(5)
    await flushMicrotasks()
    emitScanSession({ sessionId: "ports-1", kind: "ports" })
    emitScanSession({ sessionId: "pcap-1", kind: "pcap" })

    await act(async () => {
      await networkProbeUseCases.revokeSecurityAuthorization()
    })

    expect(useNetworkProbeStore.getState().securityAuthorized).toBe(false)
    expect(cancelScan).toHaveBeenCalledTimes(2)
    expect(cancelScan).toHaveBeenCalledWith("ports-1")
    expect(cancelScan).toHaveBeenCalledWith("pcap-1")
    expect(useNetworkProbeStore.getState().portScanResult).toBeNull()
    expect(useNetworkProbeStore.getState().pcapResult).toBeNull()

    scan.resolve(portScanResult)
    capture.resolve(pcapResult)
    await act(async () => {
      await Promise.all([scanPromise, capturePromise])
    })

    expect(useNetworkProbeStore.getState().portScanResult).toBeNull()
    expect(useNetworkProbeStore.getState().pcapResult).toBeNull()
    expect(useNetworkProbeStore.getState().loadingPorts).toBe(false)
    expect(useNetworkProbeStore.getState().loadingPcap).toBe(false)
  })

  it("cancels a scan session event that arrives after revoke", async () => {
    const scan = deferred<typeof portScanResult>()
    scanPorts.mockReturnValue(scan.promise)

    const scanPromise = networkProbeUseCases.runPortScan("127.0.0.1", "80")
    await flushMicrotasks()
    await act(async () => {
      await networkProbeUseCases.revokeSecurityAuthorization()
    })
    expect(cancelScan).not.toHaveBeenCalled()

    emitScanSession({ sessionId: "late-ports-1", kind: "ports" })
    await flushMicrotasks()
    expect(cancelScan).toHaveBeenCalledWith("late-ports-1")

    scan.resolve({ ...portScanResult, sessionId: "late-ports-1", cancelled: true })
    await act(async () => {
      await scanPromise
    })
    expect(useNetworkProbeStore.getState().portScanResult).toBeNull()
  })

  it("clears and ignores in-flight security lookup results after reauthorization", async () => {
    const pollution = deferred<Record<string, unknown>>()
    const whois = deferred<Record<string, unknown>>()
    const dnssec = deferred<Record<string, unknown>>()
    runPollutionCheck.mockReturnValue(pollution.promise)
    whoisLookup.mockReturnValue(whois.promise)
    checkDnssec.mockReturnValue(dnssec.promise)

    const lookups = [
      networkProbeUseCases.runPollutionCheck("example.com"),
      networkProbeUseCases.runWhois("example.com"),
      networkProbeUseCases.runDnssec("example.com"),
    ]
    await flushMicrotasks()

    useNetworkProbeStore.getState().setPortScanResult(portScanResult as never)
    await act(async () => {
      await networkProbeUseCases.revokeSecurityAuthorization()
    })
    useNetworkProbeStore.getState().setSecurityAuthorized(true)

    pollution.resolve({ domain: "example.com" })
    whois.resolve({ query: "example.com" })
    dnssec.resolve({ domain: "example.com" })
    await act(async () => {
      await Promise.all(lookups)
    })

    const state = useNetworkProbeStore.getState()
    expect(state.securityAuthorized).toBe(true)
    expect(state.pollutionResult).toBeNull()
    expect(state.whoisResult).toBeNull()
    expect(state.dnssecResult).toBeNull()
    expect(state.portScanResult).toBeNull()
    expect(state.loadingPollution).toBe(false)
    expect(state.loadingWhois).toBe(false)
    expect(state.loadingDnssec).toBe(false)
  })

  it("does not surface a lookup error after its authorization is revoked", async () => {
    const whois = deferred<Record<string, unknown>>()
    whoisLookup.mockReturnValue(whois.promise)

    const lookupPromise = networkProbeUseCases.runWhois("example.com")
    await flushMicrotasks()
    await act(async () => {
      await networkProbeUseCases.revokeSecurityAuthorization()
    })

    whois.reject(new Error("synthetic stale failure"))
    await act(async () => {
      await lookupPromise
    })

    expect(useNetworkProbeStore.getState().errors).not.toContainEqual(
      expect.objectContaining({ key: "networkProbe.errors.whoisFailed" }),
    )
    expect(useNetworkProbeStore.getState().error).toBeNull()
  })
})

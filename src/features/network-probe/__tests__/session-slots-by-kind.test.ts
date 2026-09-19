/**
 * network-probe session slot test / 会话分槽测试:
 *   1) 多类探测并发时，取消目标按探测种类各取各的槽，先结束的一方不清对方的槽；
 *   2) 重跑时先清空上一轮 result，避免面板用旧数据遮蔽本轮流式进度。
 */
import { act } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { runHealthScan, scanPorts, sitesProbe, runTraceroute, cancelScan } = vi.hoisted(() => ({
  runHealthScan: vi.fn(),
  scanPorts: vi.fn(),
  sitesProbe: vi.fn(),
  runTraceroute: vi.fn(),
  cancelScan: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    runHealthScan,
    scanPorts,
    sitesProbe,
    runTraceroute,
    cancelScan,
  },
}))

// 一份事件名可能同时挂着多类探测的监听器（并发跑），所以 handler 用集合存。
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, Set<(event: { payload: unknown }) => void>>(),
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(
    async (event: string, handler: (e: { payload: unknown }) => void) => {
      let set = handlers.get(event)
      if (!set) {
        set = new Set()
        handlers.set(event, set)
      }
      set.add(handler)
      return () => set?.delete(handler)
    },
  ),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import { TAURI_EVENTS } from "@/lib/tauri/contracts"

const SCAN_SESSION = TAURI_EVENTS.networkProbe.scanSession

function emitScanSession(payload: { sessionId: string; kind: string }) {
  act(() => {
    handlers.get(SCAN_SESSION)?.forEach((handler) => handler({ payload }))
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function flushMicrotasks() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function slots() {
  return useNetworkProbeStore.getState().activeSessionIdByKind
}

beforeEach(() => {
  handlers.clear()
  runHealthScan.mockReset()
  scanPorts.mockReset()
  sitesProbe.mockReset()
  runTraceroute.mockReset()
  cancelScan.mockReset()
  useNetworkProbeStore.setState({
    securityAuthorized: true,
    loadingHealth: false,
    loadingPorts: false,
    loadingSites: false,
    loadingTraceroute: false,
    healthResult: null,
    portScanResult: null,
    sitesResult: null,
    tracerouteResult: null,
    activeSessionIdByKind: {
      health: null,
      sites: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
    cancelRequestedSessionIdByKind: {
      health: null,
      sites: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
    reportHistory: [],
    commandLog: [],
    error: null,
  })
})

describe("network-probe session slots per probe kind", () => {
  it("cancels only the requested probe kind and keeps the other kind's target", async () => {
    const health = deferred<Record<string, unknown>>()
    const ports = deferred<Record<string, unknown>>()
    runHealthScan.mockReturnValue(health.promise)
    scanPorts.mockReturnValue(ports.promise)
    cancelScan.mockResolvedValue(true)

    const healthPromise = networkProbeUseCases.runHealthScan()
    const portsPromise = networkProbeUseCases.runPortScan("127.0.0.1", "22")
    await flushMicrotasks()

    emitScanSession({ sessionId: "health-1", kind: "health" })
    emitScanSession({ sessionId: "ports-1", kind: "ports" })
    expect(slots().health).toBe("health-1")
    expect(slots().ports).toBe("ports-1")

    // 两类探测同时在跑: 取消端口扫描只能打到 ports-1。
    await act(async () => {
      await networkProbeUseCases.cancelScan("ports")
    })
    expect(cancelScan).toHaveBeenCalledTimes(1)
    expect(cancelScan).toHaveBeenCalledWith("ports-1")

    // 端口扫描先结束: 只能清自己那一槽，体检的取消目标必须留着。
    ports.resolve({
      sessionId: "ports-1",
      cancelled: false,
      openPorts: [],
      samples: [],
      mode: "tcp-connect",
      commandHint: "",
    })
    await portsPromise
    expect(slots().ports).toBeNull()
    expect(slots().health).toBe("health-1")

    // 缺陷复现路径: 跑体检 → 再跑端口扫描 → 端口扫描先跑完 → 回体检点取消，仍能取消到体检。
    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })
    expect(cancelScan).toHaveBeenCalledTimes(2)
    expect(cancelScan).toHaveBeenLastCalledWith("health-1")
    // 同类会话取消幂等 (A4-4): 重复点不再发 IPC。
    await act(async () => {
      await networkProbeUseCases.cancelScan("health")
    })
    expect(cancelScan).toHaveBeenCalledTimes(2)

    health.resolve({
      sessionId: "health-1",
      cancelled: true,
      items: [],
      opinions: [],
      elapsedMs: 1,
      commandHint: "",
    })
    await healthPromise
    expect(slots().health).toBeNull()
  })
})

describe("network-probe rerun clears previous results", () => {
  it("drops stale health / sites / traceroute results as soon as a new run starts", async () => {
    useNetworkProbeStore.setState({
      healthResult: { sessionId: "old", items: [], opinions: [] } as never,
      sitesResult: { sessionId: "old", packId: "official", results: [] } as never,
      tracerouteResult: { sessionId: "old", hops: [], resolvedIp: "1.1.1.1" } as never,
    })
    const health = deferred<Record<string, unknown>>()
    const sites = deferred<Record<string, unknown>>()
    const traceroute = deferred<Record<string, unknown>>()
    runHealthScan.mockReturnValue(health.promise)
    sitesProbe.mockReturnValue(sites.promise)
    runTraceroute.mockReturnValue(traceroute.promise)

    const healthPromise = networkProbeUseCases.runHealthScan()
    const sitesPromise = networkProbeUseCases.runSitesProbe("official")
    const traceroutePromise = networkProbeUseCases.runTraceroute("1.1.1.1", 20, 3)
    await flushMicrotasks()

    const state = useNetworkProbeStore.getState()
    expect(state.healthResult).toBeNull()
    expect(state.sitesResult).toBeNull()
    expect(state.tracerouteResult).toBeNull()

    health.resolve({
      sessionId: "health-2",
      cancelled: true,
      items: [],
      opinions: [],
      elapsedMs: 1,
      commandHint: "",
    })
    sites.resolve({
      sessionId: "sites-2",
      packId: "official",
      results: [],
      cancelled: true,
      elapsedMs: 1,
      commandHint: "",
    })
    traceroute.resolve({
      sessionId: "tr-2",
      cancelled: true,
      hops: [],
      resolvedIp: "1.1.1.1",
      privilegeMode: "unprivileged",
      elapsedMs: 1,
      commandHint: "",
    })
    await Promise.all([healthPromise, sitesPromise, traceroutePromise])

    const done = useNetworkProbeStore.getState()
    expect(done.healthResult?.sessionId).toBe("health-2")
    expect(done.sitesResult?.sessionId).toBe("sites-2")
    expect(done.tracerouteResult?.sessionId).toBe("tr-2")
  })
})

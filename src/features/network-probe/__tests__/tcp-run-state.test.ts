import { beforeEach, describe, expect, it, vi } from "vitest"

const { tcpConnect } = vi.hoisted(() => ({ tcpConnect: vi.fn() }))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: { tcpConnect },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { TcpConnectResult } from "@/lib/tauri/types/network-probe"

function deferred<T>() {
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((_, rejectPromise) => {
    reject = rejectPromise
  })
  return { promise, reject }
}

const previousResult = {
  host: "127.0.0.1",
  port: 3200,
  status: "ok",
  rttMs: 0.2,
  commandHint: "tcpConnect(local, '127.0.0.1', 3200, 3000)",
} satisfies TcpConnectResult

beforeEach(() => {
  tcpConnect.mockReset()
  useNetworkProbeStore.setState({
    loadingTcp: false,
    tcpResult: previousResult,
    commandLog: [],
    error: null,
  })
})

describe("network-probe TCP run state", () => {
  it("clears the previous host:port result before a rerun that fails", async () => {
    const request = deferred<TcpConnectResult>()
    tcpConnect.mockReturnValue(request.promise)

    const run = networkProbeUseCases.runTcpConnect("-bad", 3200)

    expect(useNetworkProbeStore.getState().tcpResult).toBeNull()
    expect(useNetworkProbeStore.getState().loadingTcp).toBe(true)

    request.reject(new Error("invalid host"))
    await run

    const state = useNetworkProbeStore.getState()
    expect(state.tcpResult).toBeNull()
    expect(state.error?.key).toBe("networkProbe.errors.tcpFailed")
    expect(state.loadingTcp).toBe(false)
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const fixRepository = vi.hoisted(() => ({
  flushDns: vi.fn(),
  switchDns: vi.fn(),
  renewDhcp: vi.fn(),
  resetNetworkStack: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: fixRepository,
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { FixResult } from "@/lib/tauri/types/network-probe"

function deferred<T>() {
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((_, rejectPromise) => {
    reject = rejectPromise
  })
  return { promise, reject }
}

const previousResult: FixResult = {
  action: "flushDns",
  ok: true,
  message: "DNS cache flushed",
  commandHint: "flushDns(local)",
}

beforeEach(() => {
  Object.values(fixRepository).forEach((request) => request.mockReset())
  useNetworkProbeStore.setState({
    loadingFix: false,
    fixResult: previousResult,
    error: null,
  })
})

describe("network-probe quick-fix rerun state", () => {
  it.each([
    {
      name: "flush DNS",
      run: () => networkProbeUseCases.flushDns(),
      request: fixRepository.flushDns,
    },
    {
      name: "switch DNS",
      run: () => networkProbeUseCases.switchDns("Wi-Fi", ["1.1.1.1"]),
      request: fixRepository.switchDns,
    },
    {
      name: "renew DHCP",
      run: () => networkProbeUseCases.renewDhcp("Wi-Fi"),
      request: fixRepository.renewDhcp,
    },
    {
      name: "reset the network stack",
      run: () => networkProbeUseCases.resetNetworkStack("Wi-Fi"),
      request: fixRepository.resetNetworkStack,
    },
  ])("clears the previous result before a failed $name rerun", async ({ run, request }) => {
    const nextRequest = deferred<FixResult>()
    request.mockReturnValue(nextRequest.promise)

    const action = run()

    expect(useNetworkProbeStore.getState().fixResult).toBeNull()
    expect(useNetworkProbeStore.getState().loadingFix).toBe(true)

    nextRequest.reject(new Error("controlled fix failure"))
    await action

    const state = useNetworkProbeStore.getState()
    expect(state.fixResult).toBeNull()
    expect(state.error?.key).toBe("networkProbe.errors.fixFailed")
    expect(state.loadingFix).toBe(false)
  })
})

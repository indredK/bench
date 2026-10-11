import { beforeEach, describe, expect, it, vi } from "vitest"

const { repository } = vi.hoisted(() => ({
  repository: {
    flushDns: vi.fn(),
    switchDns: vi.fn(),
    renewDhcp: vi.fn(),
    resetNetworkStack: vi.fn(),
  },
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: repository,
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

function deferred<T>() {
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((_, rejectPromise) => {
    reject = rejectPromise
  })
  return { promise, reject }
}

const fixActions = [
  {
    name: "DNS flush",
    request: repository.flushDns,
    run: () => networkProbeUseCases.flushDns(),
  },
  {
    name: "DNS switch",
    request: repository.switchDns,
    run: () => networkProbeUseCases.switchDns("Wi-Fi", ["1.1.1.1"]),
  },
  {
    name: "DHCP renewal",
    request: repository.renewDhcp,
    run: () => networkProbeUseCases.renewDhcp("Wi-Fi"),
  },
  {
    name: "network reset",
    request: repository.resetNetworkStack,
    run: () => networkProbeUseCases.resetNetworkStack("Wi-Fi"),
  },
]

beforeEach(() => {
  for (const request of Object.values(repository)) request.mockReset()
  useNetworkProbeStore.setState({
    loadingFix: false,
    fixResult: {
      action: "flushDns",
      ok: true,
      message: "Previous DNS flush succeeded",
      commandHint: "old command",
    },
    errors: [],
    error: null,
  })
})

describe("network-probe fix result reset before rerun", () => {
  it.each(fixActions)("clears the previous result before starting $name", async (action) => {
    const request = deferred<never>()
    action.request.mockReturnValueOnce(request.promise)

    const run = action.run()

    expect(useNetworkProbeStore.getState().loadingFix).toBe(true)
    expect(useNetworkProbeStore.getState().fixResult).toBeNull()

    request.reject(new Error("simulated fix failure"))
    await run

    expect(useNetworkProbeStore.getState().fixResult).toBeNull()
    expect(useNetworkProbeStore.getState().errors.map((error) => error.key)).toContain(
      "networkProbe.errors.fixFailed",
    )
  })
})

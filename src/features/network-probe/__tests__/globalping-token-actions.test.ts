import { beforeEach, describe, expect, it, vi } from "vitest"

const { getGlobalpingTokenStatus, saveGlobalpingToken, clearGlobalpingToken } = vi.hoisted(() => ({
  getGlobalpingTokenStatus: vi.fn(),
  saveGlobalpingToken: vi.fn(),
  clearGlobalpingToken: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    getGlobalpingTokenStatus,
    saveGlobalpingToken,
    clearGlobalpingToken,
  },
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  getGlobalpingTokenStatus.mockReset()
  saveGlobalpingToken.mockReset()
  clearGlobalpingToken.mockReset()
  useNetworkProbeStore.setState({
    globalpingTokenConfigured: null,
    loadingGlobalpingToken: false,
    commandLog: [],
    error: null,
  })
})

describe("Globalping token actions", () => {
  it("stores only configuration state and never writes the secret to command history", async () => {
    const token = "gp_secret-token-never-log-this"
    saveGlobalpingToken.mockResolvedValue(undefined)

    await networkProbeUseCases.saveGlobalpingToken(token)

    expect(saveGlobalpingToken).toHaveBeenCalledWith(token)
    expect(useNetworkProbeStore.getState().globalpingTokenConfigured).toBe(true)
    expect(useNetworkProbeStore.getState().commandLog.join("\n")).not.toContain(token)
    expect(useNetworkProbeStore.getState().loadingGlobalpingToken).toBe(false)
  })

  it("keeps credential writes single-flight", async () => {
    const writing = deferred<void>()
    saveGlobalpingToken.mockReturnValue(writing.promise)

    const first = networkProbeUseCases.saveGlobalpingToken("gp_first-token")
    expect(useNetworkProbeStore.getState().loadingGlobalpingToken).toBe(true)
    await expect(networkProbeUseCases.saveGlobalpingToken("gp_second-token")).resolves.toBe(false)
    expect(saveGlobalpingToken).toHaveBeenCalledTimes(1)

    writing.resolve()
    await expect(first).resolves.toBe(true)
    expect(useNetworkProbeStore.getState().globalpingTokenConfigured).toBe(true)
  })

  it("does not claim a credential was saved after keyring failure", async () => {
    saveGlobalpingToken.mockRejectedValue(new Error("keychain denied"))

    await expect(networkProbeUseCases.saveGlobalpingToken("gp_token")).resolves.toBe(false)
    expect(useNetworkProbeStore.getState().globalpingTokenConfigured).toBeNull()
    expect(useNetworkProbeStore.getState().error?.key).toBe(
      "networkProbe.errors.globalpingTokenFailed",
    )
  })

  it("clears stale configuration state when the Keychain status cannot be read", async () => {
    getGlobalpingTokenStatus.mockRejectedValue(new Error("keychain denied"))
    useNetworkProbeStore.setState({ globalpingTokenConfigured: true })

    await expect(networkProbeUseCases.refreshGlobalpingTokenStatus()).resolves.toBe(false)

    expect(useNetworkProbeStore.getState().globalpingTokenConfigured).toBeNull()
    expect(useNetworkProbeStore.getState().error?.key).toBe(
      "networkProbe.errors.globalpingTokenFailed",
    )
  })
})

import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  installCapabilityPack,
  installCapabilityPackVerifyFail,
  listCapabilityPacks,
  getCapabilities,
} = vi.hoisted(() => ({
  installCapabilityPack: vi.fn(),
  installCapabilityPackVerifyFail: vi.fn(),
  listCapabilityPacks: vi.fn(),
  getCapabilities: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    installCapabilityPack,
    installCapabilityPackVerifyFail,
    listCapabilityPacks,
    getCapabilities,
  },
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(async () => vi.fn()),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"

const hashMismatchResult = {
  packId: "pcap-diag",
  ok: false,
  mode: "hash-mismatch",
  message: "[PACK_HASH_MISMATCH] SHA-256 mismatch.",
  commandHint: "installCapabilityPack('pcap-diag') // hash-mismatch",
}

beforeEach(() => {
  vi.clearAllMocks()
  installCapabilityPack.mockResolvedValue(hashMismatchResult)
  installCapabilityPackVerifyFail.mockResolvedValue(hashMismatchResult)
  listCapabilityPacks.mockResolvedValue([])
  getCapabilities.mockResolvedValue({ platform: "macos", privilegeLevel: "none", tools: {} })
  useNetworkProbeStore.setState({
    capabilityPacks: [],
    packProgressText: "previous progress",
    packInstallResult: null,
    commandLog: [],
    error: null,
  })
})

describe("capability pack install results", () => {
  it("retains a failed result returned by the real install command", async () => {
    await networkProbeUseCases.installCapabilityPack("pcap-diag")

    const state = useNetworkProbeStore.getState()
    expect(state.packInstallResult).toEqual(hashMismatchResult)
    expect(state.packProgressText).toBeNull()
    expect(listCapabilityPacks).toHaveBeenCalledOnce()
    expect(
      state.commandLog.some((line) => line.includes("pack install failed: hash-mismatch")),
    ).toBe(true)
  })

  it("stores test-channel failure as a result instead of progress text", async () => {
    await networkProbeUseCases.installCapabilityPackVerifyFail("pcap-diag")

    const state = useNetworkProbeStore.getState()
    expect(state.packInstallResult).toEqual(hashMismatchResult)
    expect(state.packProgressText).toBeNull()
  })
})

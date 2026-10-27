import { afterEach, describe, expect, it, vi } from "vitest"

const STORAGE_KEY = "network-probe:nav"

afterEach(() => {
  sessionStorage.removeItem(STORAGE_KEY)
  vi.resetModules()
})

describe("network-probe navigation storage", () => {
  it("falls back safely when a saved L1 route is an inherited object key", async () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        l1Id: "constructor",
        l2ByL1: { basic: "tree" },
        offlineSub: "all",
      }),
    )
    vi.resetModules()

    const { useNetworkProbeStore } = await import("@/features/network-probe/store")

    expect(useNetworkProbeStore.getState().nav).toMatchObject({
      l1Id: "basic",
      l2ByL1: { basic: "tree" },
    })
  })
})

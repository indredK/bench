import { beforeEach, describe, expect, it } from "vitest"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { SiteSampleResult } from "@/lib/tauri/types/network-probe"

function sample(overrides: Partial<SiteSampleResult> = {}): SiteSampleResult {
  return {
    id: "site-a",
    target: "https://example.com",
    channel: "both",
    ok: true,
    ...overrides,
  }
}

beforeEach(() => {
  useNetworkProbeStore.setState({ sitesStreaming: [], siteSparklineByTarget: {} })
})

describe("network site sparkline history", () => {
  it("keeps custom targets separate and inserts gaps when a site is unreachable", () => {
    const store = useNetworkProbeStore.getState()
    store.upsertSiteSample(sample({ id: "custom-0", target: "https://a.example", httpTtfbMs: 12 }))
    useNetworkProbeStore
      .getState()
      .upsertSiteSample(sample({ id: "custom-0", target: "https://b.example", httpTtfbMs: 22 }))
    useNetworkProbeStore
      .getState()
      .upsertSiteSample(
        sample({ id: "custom-0", target: "https://a.example", ok: false, icmpRttMs: 99 }),
      )

    expect(useNetworkProbeStore.getState().siteSparklineByTarget).toEqual({
      "https://b.example": [22],
      "https://a.example": [12, null],
    })
  })

  it("retains no more than twenty samples per target and one hundred targets", () => {
    for (let index = 0; index < 105; index += 1) {
      useNetworkProbeStore
        .getState()
        .upsertSiteSample(
          sample({ id: `custom-${index}`, target: `https://${index}.example`, httpTtfbMs: index }),
        )
    }
    const store = useNetworkProbeStore.getState()
    expect(Object.keys(store.siteSparklineByTarget)).toHaveLength(100)
    expect(store.siteSparklineByTarget["https://0.example"]).toBeUndefined()

    for (let index = 0; index < 25; index += 1) {
      useNetworkProbeStore
        .getState()
        .upsertSiteSample(sample({ target: "https://104.example", httpTtfbMs: index }))
    }
    expect(
      useNetworkProbeStore.getState().siteSparklineByTarget["https://104.example"],
    ).toHaveLength(20)
  })
})

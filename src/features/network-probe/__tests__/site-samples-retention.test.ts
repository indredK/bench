import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { SiteSampleResult } from "@/lib/tauri/types/network-probe"

function sample(target: string, httpTtfbMs: number): SiteSampleResult {
  return {
    id: target,
    target,
    channel: "http",
    ok: true,
    httpStatus: 200,
    httpTtfbMs,
  }
}

beforeEach(() => {
  useNetworkProbeStore.setState({
    sitesStreaming: [],
    siteLatestByTarget: {},
    siteSparklineById: {},
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("network-probe site sample retention", () => {
  it("keeps the latest result per target after the streaming batch is reset", () => {
    let now = 1_000
    vi.spyOn(Date, "now").mockImplementation(() => now)
    const store = useNetworkProbeStore.getState()

    store.upsertSiteSample(sample("https://one.example", 120))
    now = 2_000
    store.upsertSiteSample(sample(" https://one.example ", 90))
    store.upsertSiteSample(sample("https://two.example", 200))
    useNetworkProbeStore.getState().resetSitesStreaming()

    const latest = useNetworkProbeStore.getState().siteLatestByTarget
    expect(latest["https://one.example"]).toEqual({
      sample: sample(" https://one.example ", 90),
      testedAt: 2_000,
    })
    expect(latest["https://two.example"]?.sample.httpTtfbMs).toBe(200)
    expect(useNetworkProbeStore.getState().sitesStreaming).toEqual([])
  })

  it("clears only targets included in the pack that is being rerun", () => {
    const store = useNetworkProbeStore.getState()
    store.mergeSiteLatestSamples([
      sample("https://one.example", 120),
      sample("https://two.example", 200),
      sample("https://other-pack.example", 300),
    ])

    useNetworkProbeStore
      .getState()
      .clearSiteLatestByTargets([" https://one.example ", "https://two.example"])

    expect(Object.keys(useNetworkProbeStore.getState().siteLatestByTarget)).toEqual([
      "https://other-pack.example",
    ])
  })

  it("bounds the latest target cache to 256 entries and evicts the oldest sample", () => {
    let now = 0
    vi.spyOn(Date, "now").mockImplementation(() => ++now)
    const store = useNetworkProbeStore.getState()

    for (let index = 0; index < 257; index += 1) {
      store.upsertSiteSample(sample(`https://site-${index}.example`, index))
    }

    const latest = useNetworkProbeStore.getState().siteLatestByTarget
    expect(Object.keys(latest)).toHaveLength(256)
    expect(latest["https://site-0.example"]).toBeUndefined()
    expect(latest["https://site-256.example"]).toBeDefined()
  })
})

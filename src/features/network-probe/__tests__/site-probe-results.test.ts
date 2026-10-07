import { afterEach, describe, expect, it } from "vitest"
import { selectSiteProbePanelResults } from "@/features/network-probe/utils/site-probe-results"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { SiteSampleResult, SitesProbeResult } from "@/lib/tauri/types/network-probe"

const siteResult: SitesProbeResult = {
  packId: "custom",
  results: [],
  sessionId: "session-1",
  cancelled: false,
  commandHint: "sitesProbe(custom)",
}

const sample = (target: string, httpTtfbMs: number): SiteSampleResult => ({
  id: "custom-0",
  target,
  channel: "http",
  ok: true,
  httpTtfbMs,
})

afterEach(() => {
  useNetworkProbeStore.setState({
    sitesStreaming: [],
    siteSparklineByTarget: {},
    sitesResultOwner: "packs",
  })
})

describe("site probe result ownership", () => {
  it("does not expose one site's result or stream in the other subview", () => {
    const streaming = [sample("https://example.invalid", 20)]
    const selected = selectSiteProbePanelResults("official", "packs", siteResult, streaming)

    expect(selected.result).toBeNull()
    expect(selected.streaming).toEqual([])
  })

  it("keeps the result owner in shared state so a remounted page preserves the filter", () => {
    useNetworkProbeStore.getState().setSitesResultOwner("official")
    const selected = selectSiteProbePanelResults(
      useNetworkProbeStore.getState().sitesResultOwner,
      "packs",
      siteResult,
      [sample("https://example.invalid", 20)],
    )

    expect(selected.result).toBeNull()
    expect(selected.streaming).toEqual([])
  })

  it("keeps each target's latency history separate even when row IDs repeat", () => {
    const store = useNetworkProbeStore.getState()
    store.upsertSiteSample(sample("https://baidu.com", 24))
    store.upsertSiteSample(sample("https://user-target.invalid", 80))

    expect(useNetworkProbeStore.getState().siteSparklineByTarget).toEqual({
      "https://baidu.com": [24],
      "https://user-target.invalid": [80],
    })
  })

  it("bounds retained target histories and evicts the least recently updated target", () => {
    const store = useNetworkProbeStore.getState()
    for (let index = 0; index < 130; index += 1) {
      store.upsertSiteSample(sample(`https://target-${index}.invalid`, index + 1))
    }

    const histories = useNetworkProbeStore.getState().siteSparklineByTarget
    expect(Object.keys(histories)).toHaveLength(128)
    expect(histories["https://target-0.invalid"]).toBeUndefined()
    expect(histories["https://target-1.invalid"]).toBeUndefined()
    expect(histories["https://target-129.invalid"]).toEqual([130])
  })
})

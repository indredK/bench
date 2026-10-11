import { beforeEach, describe, expect, it, vi } from "vitest"

const { sitesProbeCustom } = vi.hoisted(() => ({
  sitesProbeCustom: vi.fn(),
}))

vi.mock("@/features/network-probe/services/network-probe.repository", () => ({
  networkProbeRepository: {
    sitesProbeCustom,
  },
}))

vi.mock("@/platform/events", () => ({
  listenToPlatformEvent: vi.fn(async () => () => undefined),
}))

import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import { useNetworkProbeStore } from "@/features/network-probe/store"
import type { SiteSampleResult } from "@/lib/tauri/types/network-probe"

const firstTarget = "https://example.com"
const retainedTarget = "https://cloudflare.example"

function sample(id: string, target: string): SiteSampleResult {
  return {
    id,
    target,
    channel: "http",
    ok: true,
    httpStatus: 200,
    httpTtfbMs: 80,
  }
}

beforeEach(() => {
  sitesProbeCustom.mockReset().mockRejectedValue(new Error("offline"))
  useNetworkProbeStore.setState({
    loadingSites: false,
    sitesResult: null,
    sitesResultOwner: "packs",
    sitesStreaming: [],
    officialSiteSamplesByTarget: {},
    officialSitePendingTargets: [],
    activeSessionIdByKind: {
      health: null,
      sites: null,
      ping: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
    cancelRequestedSessionIdByKind: {
      health: null,
      sites: null,
      ping: null,
      traceroute: null,
      speed: null,
      ports: null,
      pcap: null,
      lan: null,
    },
    errors: [],
    error: null,
    commandLog: [],
  })
  const store = useNetworkProbeStore.getState()
  store.upsertOfficialSiteSample(sample("google", firstTarget))
  store.upsertOfficialSiteSample(sample("cloudflare", retainedTarget))
})

describe("official site card snapshots", () => {
  it("retains other card snapshots when a single-site request fails", async () => {
    await networkProbeUseCases.runSitesProbeCustom([firstTarget], "official")

    const state = useNetworkProbeStore.getState()
    expect(state.loadingSites).toBe(false)
    expect(state.sitesResult).toBeNull()
    expect(state.officialSitePendingTargets).toEqual([])
    expect(state.officialSiteSamplesByTarget[firstTarget]).toBeUndefined()
    expect(state.officialSiteSamplesByTarget[retainedTarget]?.sample.id).toBe("cloudflare")
    expect(state.error?.key).toBe("networkProbe.errors.sitesFailed")
  })
})

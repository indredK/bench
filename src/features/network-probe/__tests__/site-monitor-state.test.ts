import { describe, expect, it } from "vitest"
import {
  createSiteMonitorTrack,
  observeSiteMonitorSample,
  siteMonitorLatencyThresholdMs,
  type SiteMonitorSample,
} from "@/features/network-probe/site-monitor-state"

function sample(id: string, ok: boolean, latency: number | null = 100) {
  return {
    id,
    ok,
    icmpRttMs: latency,
    httpTtfbMs: latency === null ? null : latency + 50,
  } satisfies SiteMonitorSample
}

describe("site monitor state", () => {
  it("alerts once after two failed samples and recovers after two successes", () => {
    let track = createSiteMonitorTrack()

    let update = observeSiteMonitorSample(track, sample("monitor-0", false, null))
    track = update.track
    expect(update.transitions).toEqual([])

    update = observeSiteMonitorSample(track, sample("monitor-0", false, null))
    track = update.track
    expect(update.transitions).toEqual([{ id: "monitor-0", kind: "down" }])

    update = observeSiteMonitorSample(track, sample("monitor-0", false, null))
    track = update.track
    expect(update.transitions).toEqual([])

    update = observeSiteMonitorSample(track, sample("monitor-0", true))
    track = update.track
    expect(update.transitions).toEqual([])

    update = observeSiteMonitorSample(track, sample("monitor-0", true))
    expect(update.transitions).toEqual([{ id: "monitor-0", kind: "recovered" }])
  })

  it("uses five successful samples to freeze a median latency baseline", () => {
    const baseline = [200, 300, 400, 500, 600]
    expect(siteMonitorLatencyThresholdMs(baseline)).toBe(1000)
    expect(siteMonitorLatencyThresholdMs([1000, 1200, 1300, 1400, 1500])).toBe(2600)

    let track = createSiteMonitorTrack()
    for (const latency of baseline) {
      const update = observeSiteMonitorSample(track, sample("monitor-0", true, latency))
      track = update.track
      expect(update.transitions).toEqual([])
    }
    expect(track.baselineMs).toEqual(baseline)
  })

  it("deduplicates slow and latency recovery transitions", () => {
    let track = createSiteMonitorTrack()
    for (const latency of [200, 300, 400, 500, 600]) {
      track = observeSiteMonitorSample(track, sample("monitor-0", true, latency)).track
    }

    for (let index = 0; index < 2; index += 1) {
      const update = observeSiteMonitorSample(track, sample("monitor-0", true, 1100))
      track = update.track
      expect(update.transitions).toEqual([])
    }
    let update = observeSiteMonitorSample(track, sample("monitor-0", true, 1100))
    track = update.track
    expect(update.transitions).toEqual([
      { id: "monitor-0", kind: "slow", latencyMs: 1100, thresholdMs: 1000 },
    ])

    update = observeSiteMonitorSample(track, sample("monitor-0", true, 1200))
    track = update.track
    expect(update.transitions).toEqual([])

    update = observeSiteMonitorSample(track, sample("monitor-0", true, 1000))
    track = update.track
    expect(update.transitions).toEqual([])
    update = observeSiteMonitorSample(track, sample("monitor-0", true, 950))
    track = update.track
    expect(update.transitions).toEqual([])
    update = observeSiteMonitorSample(track, sample("monitor-0", true, 900))
    expect(update.transitions).toEqual([
      { id: "monitor-0", kind: "latencyRecovered", latencyMs: 900, thresholdMs: 1000 },
    ])
  })

  it("prefers ICMP RTT and ignores non-finite latency values", () => {
    expect(
      observeSiteMonitorSample(createSiteMonitorTrack(), {
        id: "monitor-0",
        ok: true,
        icmpRttMs: Number.NaN,
        httpTtfbMs: 200,
      }).track.baselineMs,
    ).toEqual([200])
  })
})

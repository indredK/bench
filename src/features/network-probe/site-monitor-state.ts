export const SITE_MONITOR_BASELINE_SAMPLES = 5
export const SITE_MONITOR_DOWNTIME_SAMPLES = 2
export const SITE_MONITOR_LATENCY_TRANSITION_SAMPLES = 3
export const SITE_MONITOR_MIN_LATENCY_THRESHOLD_MS = 1000
export const SITE_MONITOR_BASELINE_MULTIPLIER = 2

export interface SiteMonitorSample {
  id: string
  ok: boolean
  icmpRttMs?: number | null
  httpTtfbMs?: number | null
}

export interface SiteMonitorTrack {
  failedSamples: number
  recoveredSamples: number
  downtimeActive: boolean
  baselineMs: number[]
  slowSamples: number
  normalSamples: number
  latencyActive: boolean
}

export type SiteMonitorTransition =
  | { id: string; kind: "down" }
  | { id: string; kind: "recovered" }
  | { id: string; kind: "slow"; latencyMs: number; thresholdMs: number }
  | { id: string; kind: "latencyRecovered"; latencyMs: number; thresholdMs: number }

export interface SiteMonitorUpdate {
  track: SiteMonitorTrack
  transitions: SiteMonitorTransition[]
}

export function createSiteMonitorTrack(): SiteMonitorTrack {
  return {
    failedSamples: 0,
    recoveredSamples: 0,
    downtimeActive: false,
    baselineMs: [],
    slowSamples: 0,
    normalSamples: 0,
    latencyActive: false,
  }
}

export function siteMonitorLatencyMs(sample: SiteMonitorSample): number | null {
  for (const latency of [sample.icmpRttMs, sample.httpTtfbMs]) {
    if (typeof latency === "number" && Number.isFinite(latency) && latency >= 0) {
      return latency
    }
  }
  return null
}

export function siteMonitorLatencyThresholdMs(baselineMs: readonly number[]): number | null {
  if (baselineMs.length < SITE_MONITOR_BASELINE_SAMPLES) return null
  const sorted = [...baselineMs].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0)
  return Math.max(SITE_MONITOR_MIN_LATENCY_THRESHOLD_MS, median * SITE_MONITOR_BASELINE_MULTIPLIER)
}

export function observeSiteMonitorSample(
  previous: SiteMonitorTrack,
  sample: SiteMonitorSample,
): SiteMonitorUpdate {
  const track = { ...previous, baselineMs: [...previous.baselineMs] }
  const transitions: SiteMonitorTransition[] = []

  if (!sample.ok) {
    track.failedSamples += 1
    track.recoveredSamples = 0
    track.slowSamples = 0
    track.normalSamples = 0
    if (!track.downtimeActive && track.failedSamples >= SITE_MONITOR_DOWNTIME_SAMPLES) {
      track.downtimeActive = true
      track.latencyActive = false
      transitions.push({ id: sample.id, kind: "down" })
    }
    return { track, transitions }
  }

  track.failedSamples = 0
  if (track.downtimeActive) {
    track.recoveredSamples += 1
    if (track.recoveredSamples >= SITE_MONITOR_DOWNTIME_SAMPLES) {
      track.downtimeActive = false
      track.recoveredSamples = 0
      track.latencyActive = false
      track.slowSamples = 0
      track.normalSamples = 0
      transitions.push({ id: sample.id, kind: "recovered" })
    }
    return { track, transitions }
  }

  track.recoveredSamples = 0
  const latencyMs = siteMonitorLatencyMs(sample)
  if (latencyMs === null) return { track, transitions }

  if (track.baselineMs.length < SITE_MONITOR_BASELINE_SAMPLES) {
    track.baselineMs.push(latencyMs)
    return { track, transitions }
  }

  const thresholdMs = siteMonitorLatencyThresholdMs(track.baselineMs)
  if (thresholdMs === null) return { track, transitions }

  if (latencyMs > thresholdMs) {
    track.slowSamples += 1
    track.normalSamples = 0
    if (!track.latencyActive && track.slowSamples >= SITE_MONITOR_LATENCY_TRANSITION_SAMPLES) {
      track.latencyActive = true
      transitions.push({ id: sample.id, kind: "slow", latencyMs, thresholdMs })
    }
  } else {
    track.slowSamples = 0
    track.normalSamples += 1
    if (track.latencyActive && track.normalSamples >= SITE_MONITOR_LATENCY_TRANSITION_SAMPLES) {
      track.latencyActive = false
      track.normalSamples = 0
      transitions.push({ id: sample.id, kind: "latencyRecovered", latencyMs, thresholdMs })
    }
  }

  return { track, transitions }
}

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification"
import { networkProbeUseCases } from "@/features/network-probe/services/network-probe.use-cases"
import {
  createSiteMonitorTrack,
  observeSiteMonitorSample,
  type SiteMonitorTransition,
  type SiteMonitorTrack,
} from "@/features/network-probe/site-monitor-state"
import type { SiteSampleResult } from "@/lib/tauri/types/network-probe"
import { canUseDesktopFeatures } from "@/platform/capabilities"

export const SITE_MONITOR_INTERVAL_MS = 60_000
export const SITE_MONITOR_MAX_TARGETS = 3

export type SiteMonitorError =
  | "networkProbe.siteMonitor.errors.desktopOnly"
  | "networkProbe.siteMonitor.errors.targetsRequired"
  | "networkProbe.siteMonitor.errors.tooManyTargets"
  | "networkProbe.siteMonitor.errors.targetsChanged"
  | "networkProbe.siteMonitor.errors.permissionDenied"
  | "networkProbe.siteMonitor.errors.permissionRevoked"
  | "networkProbe.siteMonitor.errors.permissionFailed"
  | "networkProbe.siteMonitor.errors.probeFailed"
  | "networkProbe.siteMonitor.errors.probeUnavailable"
  | "networkProbe.siteMonitor.errors.deliveryFailed"

export interface UseSiteMonitorResult {
  monitoring: boolean
  starting: boolean
  checking: boolean
  paused: boolean
  error: SiteMonitorError | null
  samples: SiteSampleResult[]
  lastCheckedAt: number | null
  start: (targets: string[]) => Promise<void>
  stop: () => void
}

function siteLabel(target: string): string {
  const input = /^[a-z][a-z0-9+.-]*:\/\//i.test(target) ? target : `https://${target}`
  try {
    return new URL(input).host || "site"
  } catch {
    return "site"
  }
}

export function useSiteMonitor(targets: readonly string[], enabled: boolean): UseSiteMonitorResult {
  const { t } = useTranslation()
  const [monitoring, setMonitoring] = useState(false)
  const [starting, setStarting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<SiteMonitorError | null>(null)
  const [samples, setSamples] = useState<SiteSampleResult[]>([])
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)
  const [sessionTargets, setSessionTargets] = useState<string[]>([])
  const tracksRef = useRef<Map<string, SiteMonitorTrack>>(new Map())
  const inFlightRef = useRef(false)
  const pollAfterFlightRef = useRef<(() => void) | null>(null)
  const startingRef = useRef(false)
  const mountedRef = useRef(false)
  const sessionVersionRef = useRef(0)
  const availableTargetsKey = JSON.stringify(targets)

  const notificationForTransition = useCallback(
    (transition: SiteMonitorTransition, target: string) => {
      const label = siteLabel(target)
      switch (transition.kind) {
        case "down":
          return {
            title: t("networkProbe.siteMonitor.notifications.downTitle"),
            body: t("networkProbe.siteMonitor.notifications.downBody", { target: label }),
          }
        case "recovered":
          return {
            title: t("networkProbe.siteMonitor.notifications.recoveredTitle"),
            body: t("networkProbe.siteMonitor.notifications.recoveredBody", { target: label }),
          }
        case "slow":
          return {
            title: t("networkProbe.siteMonitor.notifications.slowTitle"),
            body: t("networkProbe.siteMonitor.notifications.slowBody", {
              target: label,
              latency: Math.round(transition.latencyMs),
              threshold: Math.round(transition.thresholdMs),
            }),
          }
        case "latencyRecovered":
          return {
            title: t("networkProbe.siteMonitor.notifications.latencyRecoveredTitle"),
            body: t("networkProbe.siteMonitor.notifications.latencyRecoveredBody", {
              target: label,
              latency: Math.round(transition.latencyMs),
            }),
          }
      }
    },
    [t],
  )
  const notificationForTransitionRef = useRef(notificationForTransition)
  notificationForTransitionRef.current = notificationForTransition

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const stop = useCallback(() => {
    // Invalidate in-flight continuations synchronously. Effect cleanup runs later,
    // so it cannot be the only guard against dispatching another target after Stop.
    sessionVersionRef.current += 1
    pollAfterFlightRef.current = null
    setMonitoring(false)
    setChecking(false)
    setPaused(false)
    tracksRef.current.clear()
  }, [])

  const start = useCallback(
    async (selectedTargets: string[]) => {
      if (startingRef.current || monitoring) return
      if (!canUseDesktopFeatures()) {
        setError("networkProbe.siteMonitor.errors.desktopOnly")
        return
      }
      if (!enabled) {
        setError("networkProbe.siteMonitor.errors.probeUnavailable")
        return
      }
      if (selectedTargets.length === 0) {
        setError("networkProbe.siteMonitor.errors.targetsRequired")
        return
      }
      if (selectedTargets.length > SITE_MONITOR_MAX_TARGETS) {
        setError("networkProbe.siteMonitor.errors.tooManyTargets")
        return
      }
      const availableTargets = new Set(JSON.parse(availableTargetsKey) as string[])
      if (selectedTargets.some((target) => !availableTargets.has(target))) {
        setError("networkProbe.siteMonitor.errors.targetsChanged")
        return
      }

      startingRef.current = true
      setStarting(true)
      setError(null)
      try {
        let granted = await isPermissionGranted()
        if (!granted) granted = (await requestPermission()) === "granted"
        if (!mountedRef.current) return
        if (!granted) {
          setError("networkProbe.siteMonitor.errors.permissionDenied")
          return
        }

        tracksRef.current = new Map(
          selectedTargets.map((_, index) => [`monitor-${index}`, createSiteMonitorTrack()]),
        )
        sessionVersionRef.current += 1
        setSessionTargets([...selectedTargets])
        setSamples([])
        setLastCheckedAt(null)
        setMonitoring(true)
      } catch {
        if (mountedRef.current) setError("networkProbe.siteMonitor.errors.permissionFailed")
      } finally {
        startingRef.current = false
        if (mountedRef.current) setStarting(false)
      }
    },
    [availableTargetsKey, enabled, monitoring],
  )

  useEffect(() => {
    if (!monitoring) return
    if (!enabled) {
      setError("networkProbe.siteMonitor.errors.probeUnavailable")
      stop()
      return
    }

    let active = true
    const sessionVersion = sessionVersionRef.current
    const isCurrentSession = () => active && sessionVersionRef.current === sessionVersion
    let visibilityVersion = 0
    let timer: number | null = null
    const currentTargets = sessionTargets
    const poll = async (queueIfBusy = false) => {
      if (!isCurrentSession() || document.visibilityState !== "visible") {
        return
      }
      if (inFlightRef.current) {
        if (queueIfBusy) pollAfterFlightRef.current = () => void poll()
        return
      }

      inFlightRef.current = true
      const requestVisibilityVersion = visibilityVersion
      setChecking(true)
      try {
        let permissionGranted = false
        try {
          permissionGranted = await isPermissionGranted()
        } catch {
          if (isCurrentSession()) {
            setError("networkProbe.siteMonitor.errors.permissionFailed")
            stop()
          }
          return
        }
        if (!isCurrentSession()) return
        if (!permissionGranted) {
          setError("networkProbe.siteMonitor.errors.permissionRevoked")
          stop()
          return
        }

        const nextSamples: SiteSampleResult[] = []
        for (const [index, target] of currentTargets.entries()) {
          if (
            !isCurrentSession() ||
            document.visibilityState !== "visible" ||
            requestVisibilityVersion !== visibilityVersion
          ) {
            return
          }

          const targetSamples = await networkProbeUseCases.monitorSites([target])
          if (
            !isCurrentSession() ||
            document.visibilityState !== "visible" ||
            requestVisibilityVersion !== visibilityVersion
          ) {
            return
          }
          const targetSample = targetSamples[0]
          if (!targetSample) {
            setError("networkProbe.siteMonitor.errors.probeFailed")
            stop()
            return
          }
          nextSamples.push({ ...targetSample, id: `monitor-${index}` })
        }

        permissionGranted = false
        try {
          permissionGranted = await isPermissionGranted()
        } catch {
          if (isCurrentSession()) {
            setError("networkProbe.siteMonitor.errors.permissionFailed")
            stop()
          }
          return
        }
        if (!isCurrentSession()) return
        if (!permissionGranted) {
          setError("networkProbe.siteMonitor.errors.permissionRevoked")
          stop()
          return
        }

        setSamples(nextSamples)
        setLastCheckedAt(Date.now())
        setError(null)
        const transitions: SiteMonitorTransition[] = []
        for (const sample of nextSamples) {
          const previous = tracksRef.current.get(sample.id) ?? createSiteMonitorTrack()
          const update = observeSiteMonitorSample(previous, sample)
          tracksRef.current.set(sample.id, update.track)
          transitions.push(...update.transitions)
        }

        for (const transition of transitions) {
          if (!isCurrentSession() || document.visibilityState !== "visible") return
          const index = Number(transition.id.slice("monitor-".length))
          const target = currentTargets[index]
          if (!target) continue
          const notification = notificationForTransitionRef.current(transition, target)
          try {
            await sendNotification(notification)
          } catch {
            if (isCurrentSession()) {
              setError("networkProbe.siteMonitor.errors.deliveryFailed")
              stop()
            }
            return
          }
        }
      } catch {
        if (isCurrentSession()) {
          setError("networkProbe.siteMonitor.errors.probeFailed")
          stop()
        }
      } finally {
        inFlightRef.current = false
        if (isCurrentSession()) setChecking(false)
        const queuedPoll = pollAfterFlightRef.current
        pollAfterFlightRef.current = null
        if (queuedPoll) {
          queueMicrotask(queuedPoll)
        } else if (
          isCurrentSession() &&
          document.visibilityState === "visible" &&
          requestVisibilityVersion !== visibilityVersion
        ) {
          queueMicrotask(() => void poll(true))
        }
      }
    }
    const scheduleNext = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = null
        if (document.visibilityState !== "visible") return
        void poll()
        scheduleNext()
      }, SITE_MONITOR_INTERVAL_MS)
    }

    const handleVisibilityChange = () => {
      if (!active) return
      visibilityVersion += 1
      const hidden = document.visibilityState !== "visible"
      setPaused(hidden)
      if (hidden) {
        if (timer !== null) window.clearTimeout(timer)
        timer = null
        return
      }
      void poll(true)
      scheduleNext()
    }

    setPaused(document.visibilityState !== "visible")
    document.addEventListener("visibilitychange", handleVisibilityChange)
    if (document.visibilityState === "visible") {
      void poll(true)
      scheduleNext()
    }
    return () => {
      active = false
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [enabled, monitoring, sessionTargets, stop])

  return { monitoring, starting, checking, paused, error, samples, lastCheckedAt, start, stop }
}

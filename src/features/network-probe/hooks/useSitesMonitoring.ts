import { useCallback, useEffect, useRef, useState } from "react"
import { canUseTauriWindow } from "@/platform/capabilities"
import type { SiteSampleResult, SitesProbeResult } from "@/lib/tauri/types/network-probe"

export const SITE_MONITOR_INTERVALS_SECONDS = [30, 60, 300] as const
export const SITE_MONITOR_DEFAULT_INTERVAL_SECONDS = 60
export const SITE_MONITOR_DEFAULT_THRESHOLD_MS = 200
export const SITE_MONITOR_MIN_THRESHOLD_MS = 1
export const SITE_MONITOR_MAX_THRESHOLD_MS = 10_000

export function getSiteMonitorAlerts(
  samples: SiteSampleResult[],
  thresholdMs: number,
): SiteSampleResult[] {
  return samples.filter((sample) => {
    if (!sample.ok) return true
    const latencyMs = sample.httpTtfbMs ?? sample.icmpRttMs
    return latencyMs != null && latencyMs >= thresholdMs
  })
}

interface UseSitesMonitoringOptions {
  loading: boolean
  toolEnabled: boolean
  canCancel: boolean
  onProbe: () => Promise<SitesProbeResult | null>
  onCancel: () => void | Promise<void>
}

export function useSitesMonitoring({
  loading,
  toolEnabled,
  canCancel,
  onProbe,
  onCancel,
}: UseSitesMonitoringOptions) {
  const [monitoring, setMonitoring] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState<number>(
    SITE_MONITOR_DEFAULT_INTERVAL_SECONDS,
  )
  const [thresholdInput, setThresholdInput] = useState(String(SITE_MONITOR_DEFAULT_THRESHOLD_MS))
  const [alertTargets, setAlertTargets] = useState<string[]>([])
  const [lastProbeFailed, setLastProbeFailed] = useState(false)
  const activeRef = useRef(false)
  const probeInFlightRef = useRef(false)
  const cancelPendingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intervalRef = useRef(intervalSeconds)
  const thresholdRef = useRef(Number(thresholdInput))
  const loadingRef = useRef(loading)
  const toolEnabledRef = useRef(toolEnabled)
  const canCancelRef = useRef(canCancel)
  const probeRef = useRef(onProbe)
  const cancelRef = useRef(onCancel)

  const threshold = Number(thresholdInput)
  const thresholdValid =
    thresholdInput.trim() !== "" &&
    Number.isFinite(threshold) &&
    threshold >= SITE_MONITOR_MIN_THRESHOLD_MS &&
    threshold <= SITE_MONITOR_MAX_THRESHOLD_MS

  useEffect(() => {
    intervalRef.current = intervalSeconds
  }, [intervalSeconds])
  useEffect(() => {
    thresholdRef.current = threshold
  }, [threshold])
  useEffect(() => {
    loadingRef.current = loading
    toolEnabledRef.current = toolEnabled
    canCancelRef.current = canCancel
    probeRef.current = onProbe
    cancelRef.current = onCancel
  }, [canCancel, loading, onCancel, onProbe, toolEnabled])

  useEffect(() => {
    if (!cancelPendingRef.current) return
    if (canCancel) {
      cancelPendingRef.current = false
      void cancelRef.current()
    } else if (!loading) {
      // The current round finished before a cancellable session was exposed.
      cancelPendingRef.current = false
    }
  }, [canCancel, loading])

  const stop = useCallback((cancelCurrent = true) => {
    const wasActive = activeRef.current
    activeRef.current = false
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setMonitoring(false)
    setAlertTargets([])
    setLastProbeFailed(false)
    if (wasActive && cancelCurrent) {
      if (canCancelRef.current) void cancelRef.current()
      else if (probeInFlightRef.current) cancelPendingRef.current = true
    }
  }, [])

  useEffect(() => {
    if (!monitoring) return undefined

    let disposed = false
    let focusPollTimer: ReturnType<typeof setInterval> | undefined
    let checkingFocus = false
    let unlisten: (() => void) | undefined
    const stopOnBlur = () => stop()
    const stopWhenDocumentHidden = () => {
      if (document.visibilityState !== "visible") stop()
    }

    // WebView blur/visibility changes are the portable foreground signal. Tauri's
    // native event covers platforms where WebView visibility is not updated on app switch.
    window.addEventListener("blur", stopOnBlur)
    document.addEventListener("visibilitychange", stopWhenDocumentHidden)

    if (canUseTauriWindow()) {
      void import("@tauri-apps/api/window")
        .then(({ getCurrentWindow }) => {
          const currentWindow = getCurrentWindow()
          const checkFocus = async () => {
            if (disposed || checkingFocus) return
            checkingFocus = true
            try {
              if (!(await currentWindow.isFocused())) stop()
            } catch (error) {
              console.warn("Unable to check Tauri window focus", error)
            } finally {
              checkingFocus = false
            }
          }

          // Native focus events are immediate when available; the low-frequency check
          // also covers macOS app hiding and window-manager edge cases that omit blur.
          void checkFocus()
          focusPollTimer = setInterval(() => void checkFocus(), 500)
          return currentWindow.onFocusChanged(({ payload: focused }) => {
            if (!focused) stop()
          })
        })
        .then((nextUnlisten) => {
          if (disposed) nextUnlisten()
          else unlisten = nextUnlisten
        })
        .catch((error: unknown) => {
          console.warn("Unable to observe Tauri window focus changes", error)
        })
    }

    return () => {
      disposed = true
      if (focusPollTimer != null) clearInterval(focusPollTimer)
      window.removeEventListener("blur", stopOnBlur)
      document.removeEventListener("visibilitychange", stopWhenDocumentHidden)
      unlisten?.()
    }
  }, [monitoring, stop])

  const start = useCallback(() => {
    if (
      activeRef.current ||
      loadingRef.current ||
      !toolEnabledRef.current ||
      !Number.isFinite(thresholdRef.current) ||
      thresholdRef.current < SITE_MONITOR_MIN_THRESHOLD_MS ||
      thresholdRef.current > SITE_MONITOR_MAX_THRESHOLD_MS
    ) {
      return
    }

    activeRef.current = true
    setMonitoring(true)
    setAlertTargets([])
    setLastProbeFailed(false)

    const runCycle = async () => {
      if (!activeRef.current) return
      let result: SitesProbeResult | null = null
      try {
        probeInFlightRef.current = true
        result = await probeRef.current()
      } catch {
        // The use case owns the user-facing error; monitoring can retry next interval.
      } finally {
        probeInFlightRef.current = false
      }
      if (!activeRef.current) return
      if (result?.cancelled) {
        stop(false)
        return
      }

      if (result == null) {
        setLastProbeFailed(true)
        setAlertTargets([])
      } else {
        setLastProbeFailed(false)
        setAlertTargets(
          getSiteMonitorAlerts(result.results, thresholdRef.current).map((sample) => sample.target),
        )
      }

      if (activeRef.current) {
        timerRef.current = setTimeout(runCycle, intervalRef.current * 1000)
      }
    }

    void runCycle()
  }, [stop])

  useEffect(
    () => () => {
      // On unmount, cancel even before the session ID event arrives. The use case
      // queues that intent on its active session tracker and sends it when ready.
      const shouldCancelCurrent = activeRef.current && probeInFlightRef.current
      activeRef.current = false
      if (timerRef.current != null) clearTimeout(timerRef.current)
      timerRef.current = null
      if (shouldCancelCurrent) void cancelRef.current()
    },
    [],
  )

  return {
    monitoring,
    intervalSeconds,
    setIntervalSeconds,
    thresholdInput,
    setThresholdInput,
    threshold,
    thresholdValid,
    alertTargets,
    lastProbeFailed,
    start,
    stop,
  }
}

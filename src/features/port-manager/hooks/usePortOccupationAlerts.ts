/**
 * Port occupation alerts / 端口占用告警: 30s 轮询检测 free → occupied 转换并发送系统通知。
 * 告警在 local/remote 模式都生效;首次轮询只建立 baseline,不发送通知。
 */
import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification"
import { portManagerUseCases } from "@/features/port-manager/services/port-manager.use-cases"
import { usePortManagerStore } from "@/features/port-manager/store"
import { canUseDesktopFeatures } from "@/platform/capabilities"

const POLL_INTERVAL_MS = 30_000

interface AlertSnapshot {
  scope: string
  occupiedPorts: Set<number>
}

interface PortObservation {
  port: number
  error?: string | null
}

function hasCompleteObservation(expectedPorts: number[], results: PortObservation[]): boolean {
  const expected = new Set(expectedPorts)
  const observed = new Set<number>()
  for (const result of results) {
    if (result.error || !expected.has(result.port) || observed.has(result.port)) return false
    observed.add(result.port)
  }
  return observed.size === expected.size
}

function getAlertScope(scanMode: string, remoteHost: string, ports: number[]): string {
  return JSON.stringify([
    scanMode,
    scanMode === "remote" ? remoteHost.trim() : "",
    [...new Set(ports)].sort((a, b) => a - b),
  ])
}

export function usePortOccupationAlerts() {
  const { t } = useTranslation()
  const alertsEnabled = usePortManagerStore((s) => s.alertsEnabled)
  const previousSnapshotRef = useRef<AlertSnapshot | null>(null)
  const pollInFlightRef = useRef(false)

  useEffect(() => {
    if (!alertsEnabled || !canUseDesktopFeatures()) {
      previousSnapshotRef.current = null
      return
    }

    let disposed = false
    let scopeGeneration = 0
    let observedScope = getAlertScope(
      usePortManagerStore.getState().scanMode,
      usePortManagerStore.getState().remoteHost,
      usePortManagerStore.getState().portStates.map((ps) => ps.port),
    )
    previousSnapshotRef.current = null
    const unsubscribe = usePortManagerStore.subscribe((state) => {
      const nextScope = getAlertScope(
        state.scanMode,
        state.remoteHost,
        state.portStates.map((ps) => ps.port),
      )
      if (nextScope !== observedScope) {
        observedScope = nextScope
        scopeGeneration += 1
        previousSnapshotRef.current = null
      }
    })

    const poll = async () => {
      // A slow local scan or remote request must not overlap the next interval.
      if (disposed || pollInFlightRef.current) return

      const { portStates, scanMode, remoteHost } = usePortManagerStore.getState()
      const ports = [...new Set(portStates.map((ps) => ps.port))].sort((a, b) => a - b)
      if (ports.length === 0) return
      const monitoredPorts = new Set(ports)
      const scope = getAlertScope(scanMode, remoteHost, ports)
      if (scope !== observedScope) return
      const requestScopeGeneration = scopeGeneration
      pollInFlightRef.current = true

      try {
        let permissionGranted = false
        try {
          permissionGranted = await isPermissionGranted()
        } catch {
          const latestState = usePortManagerStore.getState()
          if (!disposed && latestState.alertsEnabled) {
            usePortManagerStore.setState({
              alertsEnabled: false,
              alertsError: { key: "portManager.alertsPermissionFailed" },
            })
            previousSnapshotRef.current = null
          }
          return
        }

        const permissionState = usePortManagerStore.getState()
        if (disposed || !permissionState.alertsEnabled) return
        if (!permissionGranted) {
          usePortManagerStore.setState({
            alertsEnabled: false,
            alertsError: { key: "portManager.alertsPermissionRevoked" },
          })
          previousSnapshotRef.current = null
          return
        }

        const permissionScope = getAlertScope(
          permissionState.scanMode,
          permissionState.remoteHost,
          permissionState.portStates.map((ps) => ps.port),
        )
        // Do not dispatch a network check for a target that changed while the
        // system permission query was pending. A later interval will baseline
        // the new scope.
        if (permissionScope !== scope || requestScopeGeneration !== scopeGeneration) return

        let occupiedPorts: number[]
        if (scanMode === "remote") {
          const host = remoteHost.trim()
          if (!host) return
          const results = await portManagerUseCases.portCheck(host, ports)
          // A failed port check is unknown, not free. Preserve the previous
          // complete baseline so recovery cannot create a false transition.
          if (!hasCompleteObservation(ports, results)) return
          occupiedPorts = results.filter((r) => r.open && !r.error).map((r) => r.port)
        } else {
          const details = await portManagerUseCases.queryPortProcesses(ports)
          if (!hasCompleteObservation(ports, details)) return
          occupiedPorts = details.filter((d) => !d.error && d.pids.length > 0).map((d) => d.port)
        }

        if (disposed) return

        const currentState = usePortManagerStore.getState()
        const currentScope = getAlertScope(
          currentState.scanMode,
          currentState.remoteHost,
          currentState.portStates.map((ps) => ps.port),
        )
        // Ignore results from a host/mode/port set that changed while the request was pending.
        if (
          !currentState.alertsEnabled ||
          currentScope !== scope ||
          requestScopeGeneration !== scopeGeneration
        ) {
          return
        }

        const currentOccupied = new Set(occupiedPorts.filter((port) => monitoredPorts.has(port)))
        const previousSnapshot = previousSnapshotRef.current

        const newlyOccupied =
          previousSnapshot?.scope === scope
            ? [...currentOccupied].filter((port) => !previousSnapshot.occupiedPorts.has(port))
            : []

        if (newlyOccupied.length > 0) {
          let permissionGrantedBeforeDelivery = false
          let permissionCheckFailed = false
          try {
            permissionGrantedBeforeDelivery = await isPermissionGranted()
          } catch {
            permissionCheckFailed = true
          }

          const latestState = usePortManagerStore.getState()
          const latestScope = getAlertScope(
            latestState.scanMode,
            latestState.remoteHost,
            latestState.portStates.map((ps) => ps.port),
          )
          if (
            disposed ||
            !latestState.alertsEnabled ||
            latestScope !== scope ||
            requestScopeGeneration !== scopeGeneration
          ) {
            return
          }

          if (!permissionGrantedBeforeDelivery || permissionCheckFailed) {
            usePortManagerStore.setState({
              alertsEnabled: false,
              alertsError: {
                key: permissionCheckFailed
                  ? "portManager.alertsPermissionFailed"
                  : "portManager.alertsPermissionRevoked",
              },
            })
            previousSnapshotRef.current = null
            return
          }

          try {
            for (const port of newlyOccupied) {
              sendNotification({
                title: t("portManager.occupationAlertTitle"),
                body: t("portManager.occupationAlertBody", { port }),
              })
            }
          } catch {
            usePortManagerStore.setState({
              alertsEnabled: false,
              alertsError: { key: "portManager.alertsDeliveryFailed" },
            })
            previousSnapshotRef.current = null
            return
          }
        }

        // A changed scope establishes a fresh baseline without false-positive alerts.
        previousSnapshotRef.current = { scope, occupiedPorts: currentOccupied }
      } catch {
        // Failed scans do not replace the last known state or create transition alerts.
      } finally {
        pollInFlightRef.current = false
      }
    }

    void poll()
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => {
      disposed = true
      unsubscribe()
      clearInterval(id)
    }
  }, [alertsEnabled, t])
}

/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useVirtualizer } from "@tanstack/react-virtual"
import { portManagerUseCases } from "@/features/port-manager/services/port-manager.use-cases"
import { hasInvalidPortInputCharacters, parsePortsFromInput } from "@/features/port-manager/ports"
import { registerFeatureRefresh } from "@/features/refresh"
import {
  MAX_TRACKED_PORTS,
  usePortManagerStore,
  type PortScanMode,
  type PortScanStatus,
  PORT_SCAN_STATUS_META,
} from "@/features/port-manager/store"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { localizeError } from "@/lib/errors"
import { getErrorMessage } from "@/lib/tauri/errors"
import { usePortHistory } from "@/features/port-manager/hooks/usePortHistory"
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification"
import type { PortProcessDetail, ProcessNode } from "@/lib/tauri/types/port-manager"

export const commonPorts = [3000, 5173, 1420, 8080, 5000, 4200, 8000, 4321, 6006, 1234, 9000]

// Shared across controller mounts so a pending IPC call cannot race a scan
// started after navigating away and back to this feature.
const activePortScanRequests = new Map<number, number>()
let nextPortScanRequestId = 0

export const chipStatusClasses: Record<PortScanStatus, string> = {
  waiting: "opacity-65 bg-muted border-muted-foreground/20 text-muted-foreground",
  scanning:
    "bg-indigo-50 border-indigo-300 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-300 animate-pulse",
  success:
    "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300",
  empty:
    "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300",
  error:
    "bg-red-50 border-red-300 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300",
  ended: "opacity-50 bg-muted border-dashed border-muted-foreground/30 text-muted-foreground",
}

export function usePortManagerController() {
  const { t } = useTranslation()

  const inputRef = useRef<HTMLInputElement>(null!)
  const invalidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null!)

  const { readPortHistory, pushPortsHistory } = usePortHistory()
  const [portHistory, setPortHistory] = useState<number[]>(() => readPortHistory())
  const [requestingAlertsPermission, setRequestingAlertsPermission] = useState(false)
  const alertsPermissionRequestRef = useRef(false)

  const inputValue = usePortManagerStore((s) => s.inputValue)
  const showInvalidToast = usePortManagerStore((s) => s.showInvalidToast)
  const inputError = usePortManagerStore((s) => s.inputError)
  const portStates = usePortManagerStore((s) => s.portStates)
  const portDetails = usePortManagerStore((s) => s.portDetails)
  const killing = usePortManagerStore((s) => s.killing)
  const portKillResults = usePortManagerStore((s) => s.portKillResults)
  const error = usePortManagerStore((s) => s.error)
  const showEmptyPorts = usePortManagerStore((s) => s.showEmptyPorts)
  const highlightPort = usePortManagerStore((s) => s.highlightPort)
  const scanMode = usePortManagerStore((s) => s.scanMode)
  const remoteHost = usePortManagerStore((s) => s.remoteHost)
  const alertsEnabled = usePortManagerStore((s) => s.alertsEnabled)
  const alertsPermissionError = usePortManagerStore((s) => s.alertsError)

  const setInputValue = usePortManagerStore((s) => s.setInputValue)
  const setShowInvalidToast = usePortManagerStore((s) => s.setShowInvalidToast)
  const setInputError = usePortManagerStore((s) => s.setInputError)
  const setError = usePortManagerStore((s) => s.setError)
  const setAlertsError = usePortManagerStore((s) => s.setAlertsError)
  const setShowEmptyPorts = usePortManagerStore((s) => s.setShowEmptyPorts)
  const setHighlightPort = usePortManagerStore((s) => s.setHighlightPort)
  const setScanMode = usePortManagerStore((s) => s.setScanMode)
  const setAlertsEnabled = usePortManagerStore((s) => s.setAlertsEnabled)
  const removePort = usePortManagerStore((s) => s.removePort)
  const clearAll = usePortManagerStore((s) => s.clearAll)

  const canUsePlatformFeatures = canUseDesktopFeatures()
  const isScanning = portStates.some((ps) => ps.status === "scanning")

  const addPortsToScan = useCallback((ports: number[]) => {
    const { portStates: currentPortStates } = usePortManagerStore.getState()
    const updatedPorts = [...currentPortStates]
    const portsToAdd: number[] = []

    for (const port of ports) {
      if (updatedPorts.length >= MAX_TRACKED_PORTS) break
      if (updatedPorts.some((ps) => ps.port === port)) continue
      updatedPorts.push({ port, status: "waiting" })
      portsToAdd.push(port)
    }

    if (portsToAdd.length > 0) {
      updatedPorts.sort((left, right) => left.port - right.port)
      usePortManagerStore.setState({ portStates: updatedPorts })
    }

    return portsToAdd
  }, [])

  const scan = useCallback(
    async (portsToScan: number[], options?: { keepKillMessagesFor?: number[] }) => {
      if (!portManagerUseCases.isAvailable()) {
        usePortManagerStore.setState({
          error: { key: "portManager.errors.desktopOnly" },
        })
        return
      }
      if (portsToScan.length === 0) return

      const mode = usePortManagerStore.getState().scanMode
      const host = usePortManagerStore.getState().remoteHost.trim()
      if (mode === "remote" && !host) {
        usePortManagerStore.setState({
          error: { key: "portManager.errors.remoteHostRequired" },
        })
        return
      }

      const scannablePorts = [...new Set(portsToScan)].filter(
        (port) => !activePortScanRequests.has(port),
      )
      if (scannablePorts.length === 0) return

      const sessionId = usePortManagerStore.getState().scanSession
      const requestIds = new Map<number, number>()
      for (const port of scannablePorts) {
        const requestId = ++nextPortScanRequestId
        requestIds.set(port, requestId)
        activePortScanRequests.set(port, requestId)
      }
      const isCurrentRequest = (port: number) =>
        usePortManagerStore.getState().scanSession === sessionId &&
        activePortScanRequests.get(port) === requestIds.get(port)

      const keepMessages = new Set(options?.keepKillMessagesFor ?? [])
      const scannablePortSet = new Set(scannablePorts)

      try {
        usePortManagerStore.setState((state) => ({
          error: null,
          // 重扫期间**保留旧行**：先删后加会让结果卡塌成「暂无扫描结果」、
          // 工具按钮一起消失（ux-standards §2：刷新不得用空态盖掉已有数据）。
          // 新结果落地时按端口覆盖（见循环内的 merge）。
          portKillResults: Object.fromEntries(
            Object.entries(state.portKillResults).filter(
              ([port]) => !scannablePorts.includes(Number(port)) || keepMessages.has(Number(port)),
            ),
          ),
          portStates: state.portStates.map((ps) =>
            scannablePortSet.has(ps.port) && isCurrentRequest(ps.port)
              ? { ...ps, status: "scanning" as PortScanStatus }
              : ps,
          ),
        }))

        // A multi-port user scan is one batch: Local reuses one lsof/netstat
        // snapshot and one process-tree read instead of repeating them per port.
        const details =
          mode === "remote"
            ? (await portManagerUseCases.portCheck(host, scannablePorts)).map((r) =>
                portManagerUseCases.mapPortCheckToDetail(r),
              )
            : await portManagerUseCases.queryPortProcesses(scannablePorts)

        const currentState = usePortManagerStore.getState()
        const trackedPorts = new Set(currentState.portStates.map((ps) => ps.port))
        const applicablePorts = scannablePorts.filter(
          (port) => trackedPorts.has(port) && isCurrentRequest(port),
        )
        const applicablePortSet = new Set(applicablePorts)
        const resultByPort = new Map<number, PortProcessDetail | null>()
        for (const detail of details) {
          if (!applicablePortSet.has(detail.port)) continue
          resultByPort.set(detail.port, resultByPort.has(detail.port) ? null : detail)
        }

        const fresh = applicablePorts.map((port) => {
          const result = resultByPort.get(port)
          return (
            result ?? {
              port,
              pids: [],
              process_trees: [],
              fingerprint: null,
              error: "No result returned",
            }
          )
        })
        const freshByPort = new Map(fresh.map((detail) => [detail.port, detail]))
        const statusByPort = new Map(
          fresh.map((detail) => [
            detail.port,
            detail.error ? "error" : detail.pids.length > 0 ? "success" : "empty",
          ]),
        )

        usePortManagerStore.setState((state) => {
          const seen = new Set(state.portDetails.map((detail) => detail.port))
          const merged = state.portDetails.map((detail) => freshByPort.get(detail.port) ?? detail)
          const appended = fresh.filter((detail) => !seen.has(detail.port))
          return {
            portDetails: [...merged, ...appended].sort((left, right) => left.port - right.port),
            portStates: state.portStates.map((ps) => {
              const status = statusByPort.get(ps.port)
              return status ? { ...ps, status: status as PortScanStatus } : ps
            }),
          }
        })
      } catch (error) {
        const message = getErrorMessage(error) || "Port query failed"
        const currentState = usePortManagerStore.getState()
        const trackedPorts = new Set(currentState.portStates.map((ps) => ps.port))
        const applicablePorts = scannablePorts.filter(
          (port) => trackedPorts.has(port) && isCurrentRequest(port),
        )
        const failureDetails = applicablePorts.map((port) => ({
          port,
          pids: [],
          process_trees: [],
          fingerprint: null,
          error: message,
        }))
        const failureByPort = new Map(failureDetails.map((detail) => [detail.port, detail]))
        usePortManagerStore.setState((state) => {
          const seen = new Set(state.portDetails.map((detail) => detail.port))
          const merged = state.portDetails.map((detail) => failureByPort.get(detail.port) ?? detail)
          const appended = failureDetails.filter((detail) => !seen.has(detail.port))
          return {
            portDetails: [...merged, ...appended].sort((left, right) => left.port - right.port),
            portStates: state.portStates.map((ps) =>
              failureByPort.has(ps.port) ? { ...ps, status: "error" as PortScanStatus } : ps,
            ),
          }
        })
      } finally {
        for (const [port, requestId] of requestIds) {
          if (activePortScanRequests.get(port) === requestId) {
            activePortScanRequests.delete(port)
          }
        }
      }
    },
    [],
  )

  const handleRemovePort = useCallback(
    (port: number) => {
      activePortScanRequests.delete(port)
      removePort(port)
    },
    [removePort],
  )

  const handleClearAll = useCallback(() => {
    activePortScanRequests.clear()
    clearAll()
  }, [clearAll])

  const rescanAll = useCallback(() => {
    const allPorts = usePortManagerStore.getState().portStates.map((ps) => ps.port)
    if (allPorts.length === 0) return
    void scan(allPorts)
  }, [scan])

  const killPort = useCallback(
    async (port: number, pids: number[]) => {
      const initialState = usePortManagerStore.getState()
      if (
        initialState.scanMode !== "local" ||
        initialState.killing ||
        initialState.portStates.some((ps) => ps.status === "scanning")
      ) {
        return
      }
      usePortManagerStore.setState({ error: null, killing: true })
      try {
        const { portDetails: currentDetails, scanSession } = usePortManagerStore.getState()
        const targets = portManagerUseCases.buildKillTargets(pids, currentDetails)
        if (targets.length > portManagerUseCases.MAX_KILL_TARGETS) {
          usePortManagerStore.setState({
            error: {
              key: "portManager.errors.tooManyKillTargets",
              values: { max: portManagerUseCases.MAX_KILL_TARGETS },
            },
          })
          return
        }
        const result = await portManagerUseCases.killProcesses(targets)
        const currentState = usePortManagerStore.getState()
        if (
          currentState.scanSession !== scanSession ||
          !currentState.portStates.some((state) => state.port === port)
        ) {
          return
        }
        usePortManagerStore.setState((state) => ({
          portKillResults: { ...state.portKillResults, [port]: result },
        }))
        // kill 结论必须活过紧随的自动重扫：scan 若不保留这批端口，提示会在同一帧
        // 被清空，权限不足/PID 复用被拒也都看不见，只剩「端口行消失又回来」。
        void scan([port], { keepKillMessagesFor: [port] })
      } catch (error) {
        usePortManagerStore.setState({
          error: {
            key: "portManager.errors.killOneFailed",
            fallback: getErrorMessage(error) || undefined,
          },
        })
      } finally {
        usePortManagerStore.setState({ killing: false })
      }
    },
    [scan],
  )

  const killAll = useCallback(async () => {
    const initialState = usePortManagerStore.getState()
    if (
      initialState.scanMode !== "local" ||
      initialState.killing ||
      initialState.portStates.some((ps) => ps.status === "scanning")
    ) {
      return
    }
    const { portDetails: currentPortDetails, scanSession } = initialState
    usePortManagerStore.setState({ error: null, killing: true })
    try {
      const allPids = currentPortDetails.flatMap((detail) => detail.pids)
      const portsToRescan = currentPortDetails.map((detail) => detail.port)
      const targets = portManagerUseCases.buildKillTargets(allPids, currentPortDetails)
      if (targets.length > portManagerUseCases.MAX_KILL_TARGETS) {
        usePortManagerStore.setState({
          error: {
            key: "portManager.errors.tooManyKillTargets",
            values: { max: portManagerUseCases.MAX_KILL_TARGETS },
          },
        })
        return
      }
      const result = await portManagerUseCases.killProcesses(targets)
      const currentState = usePortManagerStore.getState()
      if (currentState.scanSession !== scanSession) return
      const trackedPorts = new Set(currentState.portStates.map((state) => state.port))
      const visiblePortDetails = currentPortDetails.filter((detail) =>
        trackedPorts.has(detail.port),
      )
      const killResults = portManagerUseCases.groupKillResultsByPort(result, visiblePortDetails)
      usePortManagerStore.setState({ portKillResults: killResults })
      const visiblePortsToRescan = portsToRescan.filter((port) => trackedPorts.has(port))
      if (visiblePortsToRescan.length > 0) {
        void scan(visiblePortsToRescan, { keepKillMessagesFor: visiblePortsToRescan })
      }
    } catch (error) {
      usePortManagerStore.setState({
        error: {
          key: "portManager.errors.killAllFailed",
          fallback: getErrorMessage(error) || undefined,
        },
      })
    } finally {
      usePortManagerStore.setState({ killing: false })
    }
  }, [scan])

  const clearInvalidTimer = useCallback(() => {
    if (invalidTimerRef.current) {
      clearTimeout(invalidTimerRef.current)
      invalidTimerRef.current = null
    }
  }, [])

  const clearHighlightTimer = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = null
    }
  }, [])

  const handleInvalidInput = useCallback(
    (message?: string) => {
      setShowInvalidToast(true)
      setInputError(message || t("portManager.invalidInput"))
      clearInvalidTimer()
      invalidTimerRef.current = setTimeout(() => {
        setInputValue("")
        setShowInvalidToast(false)
        setInputError("")
        invalidTimerRef.current = null
      }, 3000)
    },
    [clearInvalidTimer, setInputValue, setShowInvalidToast, setInputError, t],
  )

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value
      setInputValue(raw)

      if (hasInvalidPortInputCharacters(raw)) {
        handleInvalidInput()
      } else {
        clearInvalidTimer()
        setShowInvalidToast(false)
      }
    },
    [clearInvalidTimer, handleInvalidInput, setInputValue, setShowInvalidToast],
  )

  const commitInput = useCallback(() => {
    const val = inputValue.trim()
    if (!val) return

    const {
      ports: newPorts,
      hasError,
      errorKey,
    } = /^[\d,\-]+$/.test(val)
      ? parsePortsFromInput(val)
      : { ports: [], hasError: true, errorKey: "invalidInput" as const }
    if (hasError) {
      handleInvalidInput(t(`portManager.${errorKey ?? "invalidInput"}`))
      return
    }
    if (newPorts.length === 0) return

    const existingPorts = usePortManagerStore.getState().portStates.map((ps) => ps.port)
    const portsToAdd = newPorts.filter((port) => !existingPorts.includes(port))
    if (portsToAdd.length === 0) {
      handleInvalidInput(t("portManager.portsAlreadyAdded"))
      return
    }

    clearInvalidTimer()
    setShowInvalidToast(false)
    setInputValue("")

    const portsToAddFinal = addPortsToScan(portsToAdd)
    if (portsToAddFinal.length > 0) {
      pushPortsHistory(portsToAddFinal)
      setPortHistory(readPortHistory())
      void scan(portsToAddFinal)
    }
  }, [
    addPortsToScan,
    clearInvalidTimer,
    handleInvalidInput,
    inputValue,
    pushPortsHistory,
    readPortHistory,
    scan,
    setInputValue,
    setShowInvalidToast,
    t,
  ])

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault()
        commitInput()
      }
      if (event.key === "Backspace" && inputValue.length === 0 && portStates.length > 0) {
        handleRemovePort(portStates[portStates.length - 1].port)
      }
    },
    [commitInput, handleRemovePort, inputValue.length, portStates],
  )

  const handleScan = useCallback(() => {
    commitInput()
  }, [commitInput])

  const addCommonPort = useCallback(
    (port: number) => {
      if (port < 1 || port > 65535) return
      const store = usePortManagerStore.getState()
      if (store.portStates.some((ps) => ps.port === port)) return
      const portsToAdd = addPortsToScan([port])
      if (portsToAdd.length > 0) {
        void scan(portsToAdd)
      }
    },
    [addPortsToScan, scan],
  )

  const handleClearInput = useCallback(() => {
    clearInvalidTimer()
    setInputValue("")
    setShowInvalidToast(false)
    setInputError("")
    inputRef.current?.focus()
  }, [clearInvalidTimer, setInputError, setInputValue, setShowInvalidToast])

  const displayedDetails = useMemo(
    () =>
      showEmptyPorts
        ? portDetails
        : // 查询失败的行不是「空闲」，隐藏空闲时也必须留在列表里，
          // 否则一次 lsof 失败就被说成「已扫描的端口均为空闲」。
          portDetails.filter((d) => Boolean(d.error) || d.pids.length > 0),
    [portDetails, showEmptyPorts],
  )

  const occupiedCount = useMemo(
    () => portDetails.filter((d) => !d.error && d.pids.length > 0).length,
    [portDetails],
  )

  const rowVirtualizer = useVirtualizer({
    count: displayedDetails.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: (index) => displayedDetails[index]?.port ?? index,
  })

  const scrollToPort = useCallback(
    (port: number) => {
      const index = displayedDetails.findIndex((d) => d.port === port)
      if (index >= 0) {
        rowVirtualizer.scrollToIndex(index, { align: "start" })
      }
      setHighlightPort(port)
      clearHighlightTimer()
      highlightTimerRef.current = setTimeout(() => {
        setHighlightPort(null)
        highlightTimerRef.current = null
      }, 2000)
    },
    [clearHighlightTimer, displayedDetails, rowVirtualizer, setHighlightPort],
  )

  const handleKillPort = useCallback(
    (port: number, pids: number[]) => {
      void killPort(port, pids)
    },
    [killPort],
  )

  const handleKillAll = useCallback(() => {
    void killAll()
  }, [killAll])

  const handleRescanPort = useCallback(
    (port: number) => {
      void scan([port])
    },
    [scan],
  )

  const statusIconFor = useCallback((status: PortScanStatus) => {
    switch (status) {
      case "waiting":
        return createElement("span", { className: "size-2 opacity-0" })
      case "scanning":
        return createElement("span", {
          className:
            "size-3 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500 dark:border-indigo-800 dark:border-t-indigo-400",
        })
      case "success":
        return createElement("span", {
          className: "size-2 rounded-full bg-emerald-500 dark:bg-emerald-400",
        })
      case "empty":
        return createElement("span", {
          className: "size-2 rounded-full bg-blue-400 dark:bg-blue-300",
        })
      case "error":
        return createElement("span", {
          className: "size-2 rounded-full bg-red-500 dark:bg-red-400",
        })
      case "ended":
        return createElement("span", { className: "size-2 rounded-full bg-muted-foreground" })
    }
  }, [])

  useEffect(
    () => () => {
      clearInvalidTimer()
      clearHighlightTimer()
      // Zustand store is module-scoped and survives unmount; reset the highlight
      // explicitly so re-mounting the page doesn't show a stale highlight from
      // a previous visit that was navigated away before the 2s timer fired (#077).
      setHighlightPort(null)
    },
    [clearHighlightTimer, clearInvalidTimer, setHighlightPort],
  )

  useEffect(() => registerFeatureRefresh("port-manager", rescanAll), [rescanAll])

  const errorMessage = error ? localizeError(t, error) : ""

  const handleScanModeChange = useCallback(
    (mode: PortScanMode) => {
      activePortScanRequests.clear()
      setScanMode(mode)
      // 切换模式时清除已有结果,避免混合 local/remote 数据展示。
      usePortManagerStore.setState((state) => ({
        scanSession: state.scanSession + 1,
        portStates: [],
        portDetails: [],
        portKillResults: {},
        error: null,
        alertsEnabled: false,
        alertsError: null,
      }))
    },
    [setScanMode],
  )

  const updateRemoteHost = useCallback((host: string) => {
    const current = usePortManagerStore.getState()
    if (current.scanMode === "remote" && current.remoteHost.trim() !== host.trim()) {
      activePortScanRequests.clear()
    }
    usePortManagerStore.setState((state) => {
      if (state.remoteHost === host) return state
      if (state.scanMode !== "remote" || state.remoteHost.trim() === host.trim()) {
        return { remoteHost: host }
      }

      return {
        remoteHost: host,
        scanSession: state.scanSession + 1,
        portStates: state.portStates.map((ps) => ({ ...ps, status: "ended" as PortScanStatus })),
        portDetails: [],
        portKillResults: {},
        error: null,
      }
    })
  }, [])

  const handleRemoteHostChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => updateRemoteHost(event.target.value),
    [updateRemoteHost],
  )

  const handleToggleAlerts = useCallback(async () => {
    if (alertsEnabled) {
      setAlertsEnabled(false)
      setAlertsError(null)
      return
    }
    if (alertsPermissionRequestRef.current) return

    alertsPermissionRequestRef.current = true
    setRequestingAlertsPermission(true)
    setAlertsError(null)
    try {
      let granted = await isPermissionGranted()
      if (!granted) granted = (await requestPermission()) === "granted"

      if (!granted) {
        setAlertsError({ key: "portManager.alertsPermissionDenied" })
        return
      }

      setAlertsEnabled(true)
    } catch {
      setAlertsError({ key: "portManager.alertsPermissionFailed" })
    } finally {
      alertsPermissionRequestRef.current = false
      setRequestingAlertsPermission(false)
    }
  }, [alertsEnabled, setAlertsEnabled, setAlertsError])

  const queryProcessChildren = useCallback(
    (node: Pick<ProcessNode, "pid" | "ppid" | "name" | "identity">, afterPid: number | null) =>
      portManagerUseCases.queryProcessChildren(
        node.pid,
        node.ppid,
        node.name,
        node.identity,
        afterPid,
      ),
    [],
  )

  return {
    canUsePlatformFeatures,
    inputRef,
    scrollContainerRef,
    rowVirtualizer,
    portHistory,
    inputValue,
    showInvalidToast,
    inputError,
    portStates,
    portDetails,
    killing,
    portKillResults,
    error: errorMessage,
    showEmptyPorts,
    highlightPort,
    scanMode,
    remoteHost,
    alertsEnabled,
    alertsError: alertsPermissionError ? localizeError(t, alertsPermissionError) : "",
    requestingAlertsPermission,
    setShowEmptyPorts,
    setScanMode: handleScanModeChange,
    setRemoteHost: updateRemoteHost,
    handleToggleAlerts,
    clearAll: handleClearAll,
    rescanAll,
    removePort: handleRemovePort,
    clearError: () => setError(null),
    handleInputChange,
    handleInputKeyDown,
    handleScan,
    handleClearInput,
    addCommonPort,
    scrollToPort,
    handleRescanPort,
    handleKillPort,
    handleKillAll,
    killPort,
    killAll,
    occupiedCount,
    displayedDetails,
    isScanning,
    statusIconFor,
    PORT_SCAN_STATUS_META,
    handleRemoteHostChange,
    queryProcessChildren,
  }
}

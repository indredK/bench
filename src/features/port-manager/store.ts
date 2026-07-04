/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand"
import type { PortProcessDetail } from "@/lib/tauri/types/port-manager"
import type { LocalizedError } from "@/lib/errors"

export const MAX_TRACKED_PORTS = 20

export const PORT_SCAN_STATUS_META = {
  waiting: { labelKey: "portManager.statusWaiting" },
  scanning: { labelKey: "portManager.statusScanning" },
  success: { labelKey: "portManager.statusSuccess" },
  empty: { labelKey: "portManager.statusEmpty" },
  error: { labelKey: "portManager.statusError" },
  ended: { labelKey: "portManager.statusEnded" },
} as const

export type PortScanStatus = keyof typeof PORT_SCAN_STATUS_META

/** v1.18 — 扫描模式:local = 本地进程检测,remote = 远程端口检测。 */
export type PortScanMode = "local" | "remote"

export interface PortState {
  port: number
  status: PortScanStatus
}

interface PortManagerState {
  inputValue: string
  showInvalidToast: boolean
  inputError: string
  portStates: PortState[]
  portDetails: PortProcessDetail[]
  killing: boolean
  portKillMessages: Record<number, string[]>
  error: LocalizedError | null
  showEmptyPorts: boolean
  highlightPort: number | null
  scanSession: number
  scanMode: PortScanMode
  remoteHost: string
  alertsEnabled: boolean

  setInputValue: (value: string) => void
  setShowInvalidToast: (show: boolean) => void
  setInputError: (error: string) => void
  setKilling: (killing: boolean) => void
  setError: (error: LocalizedError | null) => void
  setShowEmptyPorts: (show: boolean) => void
  setHighlightPort: (port: number | null) => void
  setScanMode: (mode: PortScanMode) => void
  setRemoteHost: (host: string) => void
  setAlertsEnabled: (enabled: boolean) => void
  removePort: (port: number) => void
  clearAll: () => void
}

export const usePortManagerStore = create<PortManagerState>((set) => ({
  inputValue: "",
  showInvalidToast: false,
  inputError: "",
  portStates: [],
  portDetails: [],
  killing: false,
  portKillMessages: {},
  error: null,
  showEmptyPorts: true,
  highlightPort: null,
  scanSession: 0,
  scanMode: "local",
  remoteHost: "",
  alertsEnabled: false,

  setInputValue: (value) => set({ inputValue: value }),
  setShowInvalidToast: (show) => set({ showInvalidToast: show }),
  setInputError: (error) => set({ inputError: error }),
  setKilling: (killing) => set({ killing }),
  setError: (error) => set({ error }),
  setShowEmptyPorts: (show) => set({ showEmptyPorts: show }),
  setHighlightPort: (port) => set({ highlightPort: port }),
  setScanMode: (mode) => set({ scanMode: mode }),
  setRemoteHost: (host) => set({ remoteHost: host }),
  setAlertsEnabled: (enabled) => set({ alertsEnabled: enabled }),

  removePort: (port) =>
    set((state) => ({
      portStates: state.portStates.filter((ps) => ps.port !== port),
      portDetails: state.portDetails.filter((d) => d.port !== port),
    })),

  clearAll: () =>
    set((state) => ({
      scanSession: state.scanSession + 1,
      inputValue: "",
      showInvalidToast: false,
      inputError: "",
      portStates: [],
      portDetails: [],
      portKillMessages: {},
      error: null,
    })),
}))

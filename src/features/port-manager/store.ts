/**
 * Feature Store / 功能状态: store state and simple actions; 只存状态与简单动作.
 */
import { create } from "zustand";
import type { PortProcessDetail } from "@/lib/tauri/types/port-manager";

export const MAX_TRACKED_PORTS = 20;

export const PORT_SCAN_STATUS_META = {
  waiting: { labelKey: "portManager.statusWaiting" },
  scanning: { labelKey: "portManager.statusScanning" },
  success: { labelKey: "portManager.statusSuccess" },
  empty: { labelKey: "portManager.statusEmpty" },
  error: { labelKey: "portManager.statusError" },
  ended: { labelKey: "portManager.statusEnded" },
} as const;

export type PortScanStatus = keyof typeof PORT_SCAN_STATUS_META;

export interface PortState {
  port: number;
  status: PortScanStatus;
}

interface PortManagerState {
  inputValue: string;
  showInvalidToast: boolean;
  inputError: string;
  portStates: PortState[];
  portDetails: PortProcessDetail[];
  killing: boolean;
  portKillMessages: Record<number, string[]>;
  error: string;
  showEmptyPorts: boolean;
  highlightPort: number | null;
  scanSession: number;

  setInputValue: (value: string) => void;
  setShowInvalidToast: (show: boolean) => void;
  setInputError: (error: string) => void;
  setKilling: (killing: boolean) => void;
  setError: (error: string) => void;
  setShowEmptyPorts: (show: boolean) => void;
  setHighlightPort: (port: number | null) => void;
  removePort: (port: number) => void;
  clearAll: () => void;
}

export const usePortManagerStore = create<PortManagerState>((set) => ({
  inputValue: "",
  showInvalidToast: false,
  inputError: "",
  portStates: [],
  portDetails: [],
  killing: false,
  portKillMessages: {},
  error: "",
  showEmptyPorts: true,
  highlightPort: null,
  scanSession: 0,

  setInputValue: (value) => set({ inputValue: value }),
  setShowInvalidToast: (show) => set({ showInvalidToast: show }),
  setInputError: (error) => set({ inputError: error }),
  setKilling: (killing) => set({ killing }),
  setError: (error) => set({ error }),
  setShowEmptyPorts: (show) => set({ showEmptyPorts: show }),
  setHighlightPort: (port) => set({ highlightPort: port }),

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
      error: "",
    })),
}));

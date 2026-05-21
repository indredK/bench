import { create } from "zustand";
import type { PortProcessDetail } from "@/lib/tauri/types/port-manager";
import { parsePortsFromInput } from "@/features/port-manager/ports";
import { portManagerUseCases } from "@/features/port-manager/services/port-manager.use-cases";

export const DEFAULT_MAX_PORTS = 20;

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
  addPortsToScan: (ports: number[]) => number[];
  clearAll: () => void;
  rescanAll: () => void;
  addPortsFromInput: (val: string) => { ports: number[]; hasError: boolean; errorKey?: string };
  doScan: (portsToScan: number[]) => Promise<void>;
  killPort: (port: number, pids: number[]) => Promise<void>;
  killAll: () => Promise<void>;
}

export const usePortManagerStore = create<PortManagerState>((set, get) => ({
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

  addPortsToScan: (ports) => {
    const { portStates } = get();
    const updatedPorts = [...portStates];
    const portsToAdd: number[] = [];

    for (const port of ports) {
      if (updatedPorts.length >= DEFAULT_MAX_PORTS) break;
      if (updatedPorts.some((ps) => ps.port === port)) continue;
      updatedPorts.push({ port, status: "waiting" });
      portsToAdd.push(port);
    }

    if (portsToAdd.length > 0) {
      updatedPorts.sort((a, b) => a.port - b.port);
      set({ portStates: updatedPorts });
    }

    return portsToAdd;
  },

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

  rescanAll: () => {
    const { portStates } = get();
    const allPorts = portStates.map((ps) => ps.port);
    if (allPorts.length > 0) {
      set((state) => ({
        portStates: state.portStates.map((ps) => ({ ...ps, status: "waiting" as PortScanStatus })),
      }));
      get().doScan(allPorts);
    }
  },

  addPortsFromInput: (val) => {
    if (!/^[\d,\-]+$/.test(val)) {
      return { ports: [], hasError: true, errorKey: "invalidInput" };
    }
    return parsePortsFromInput(val);
  },

  doScan: async (portsToScan) => {
    if (!portManagerUseCases.isAvailable()) {
      set({ error: "Port scanning is only available in the desktop app" });
      return;
    }
    if (portsToScan.length === 0) return;

    const sessionId = get().scanSession;

    set((state) => ({
      error: "",
      portDetails: state.portDetails.filter((d) => !portsToScan.includes(d.port)),
      portKillMessages: {},
    }));

    for (const port of portsToScan) {
      if (get().scanSession !== sessionId) {
        set((state) => ({
          portStates: state.portStates.map((ps) =>
            portsToScan.includes(ps.port) && (ps.status === "waiting" || ps.status === "scanning")
              ? { ...ps, status: "ended" as PortScanStatus }
              : ps
          ),
        }));
        break;
      }

      set((state) => ({
        portStates: state.portStates.map((ps) =>
          ps.port === port ? { ...ps, status: "scanning" as PortScanStatus } : ps
        ),
      }));

      try {
        const details = await portManagerUseCases.queryPortProcesses([port]);

        if (get().scanSession !== sessionId) {
          set((state) => ({
            portStates: state.portStates.map((ps) =>
              ps.port === port ? { ...ps, status: "ended" as PortScanStatus } : ps
            ),
          }));
          break;
        }

        const portDetail = details.find((d) => d.port === port);
        const isOccupied = portDetail && !portDetail.error && portDetail.pids.length > 0;

        set((state) => ({
          portDetails: [...state.portDetails, ...details],
          portStates: state.portStates.map((ps) =>
            ps.port === port ? { ...ps, status: (isOccupied ? "success" : "empty") as PortScanStatus } : ps
          ),
        }));
      } catch {
        if (get().scanSession !== sessionId) break;
        set((state) => ({
          portStates: state.portStates.map((ps) =>
            ps.port === port ? { ...ps, status: "error" as PortScanStatus } : ps
          ),
        }));
      }
    }

    set((state) => ({
      portDetails: [...state.portDetails].sort((a, b) => a.port - b.port),
    }));
  },

  killPort: async (port, pids) => {
    set({ error: "", killing: true });
    try {
      const result = await portManagerUseCases.killProcesses(pids);
      const messages = portManagerUseCases.createKillMessages(result);
      set((state) => ({
        portKillMessages: { ...state.portKillMessages, [port]: messages },
      }));
      get().doScan([port]);
    } catch (e) {
      set({ error: typeof e === "string" ? e : "Failed to kill process" });
    } finally {
      set({ killing: false });
    }
  },

  killAll: async () => {
    const { portDetails } = get();
    set({ error: "", killing: true });
    try {
      const allPids = portDetails.flatMap((d) => d.pids);
      const portsToRescan = portDetails.map((d) => d.port);
      const result = await portManagerUseCases.killProcesses(allPids);
      const killMessages = portManagerUseCases.groupKillMessagesByPort(result, portDetails);
      set({ portKillMessages: killMessages });
      if (portsToRescan.length > 0) {
        get().doScan(portsToRescan);
      }
    } catch (e) {
      set({ error: typeof e === "string" ? e : "Failed to kill processes" });
    } finally {
      set({ killing: false });
    }
  },
}));

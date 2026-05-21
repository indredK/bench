import { portManagerUseCases } from "@/features/port-manager/services/port-manager.use-cases";
import { usePortManagerStore, type PortScanStatus } from "@/features/port-manager/store";

export const portManagerOperations = {
  rescanAll() {
    const { portStates } = usePortManagerStore.getState();
    const allPorts = portStates.map((ps) => ps.port);
    if (allPorts.length === 0) return;

    usePortManagerStore.setState((state) => ({
      portStates: state.portStates.map((ps) => ({ ...ps, status: "waiting" as PortScanStatus })),
    }));
    void portManagerOperations.scan(allPorts);
  },

  async scan(portsToScan: number[]) {
    if (!portManagerUseCases.isAvailable()) {
      usePortManagerStore.setState({ error: "Port scanning is only available in the desktop app" });
      return;
    }
    if (portsToScan.length === 0) return;

    const sessionId = usePortManagerStore.getState().scanSession;

    usePortManagerStore.setState((state) => ({
      error: "",
      portDetails: state.portDetails.filter((detail) => !portsToScan.includes(detail.port)),
      portKillMessages: {},
    }));

    for (const port of portsToScan) {
      if (usePortManagerStore.getState().scanSession !== sessionId) {
        usePortManagerStore.setState((state) => ({
          portStates: state.portStates.map((ps) =>
            portsToScan.includes(ps.port) && (ps.status === "waiting" || ps.status === "scanning")
              ? { ...ps, status: "ended" as PortScanStatus }
              : ps
          ),
        }));
        break;
      }

      usePortManagerStore.setState((state) => ({
        portStates: state.portStates.map((ps) =>
          ps.port === port ? { ...ps, status: "scanning" as PortScanStatus } : ps
        ),
      }));

      try {
        const details = await portManagerUseCases.queryPortProcesses([port]);

        if (usePortManagerStore.getState().scanSession !== sessionId) {
          usePortManagerStore.setState((state) => ({
            portStates: state.portStates.map((ps) =>
              ps.port === port ? { ...ps, status: "ended" as PortScanStatus } : ps
            ),
          }));
          break;
        }

        const portDetail = details.find((detail) => detail.port === port);
        const isOccupied = portDetail && !portDetail.error && portDetail.pids.length > 0;

        usePortManagerStore.setState((state) => ({
          portDetails: [...state.portDetails, ...details],
          portStates: state.portStates.map((ps) =>
            ps.port === port ? { ...ps, status: (isOccupied ? "success" : "empty") as PortScanStatus } : ps
          ),
        }));
      } catch {
        if (usePortManagerStore.getState().scanSession !== sessionId) break;
        usePortManagerStore.setState((state) => ({
          portStates: state.portStates.map((ps) =>
            ps.port === port ? { ...ps, status: "error" as PortScanStatus } : ps
          ),
        }));
      }
    }

    usePortManagerStore.setState((state) => ({
      portDetails: [...state.portDetails].sort((left, right) => left.port - right.port),
    }));
  },

  async killPort(port: number, pids: number[]) {
    usePortManagerStore.setState({ error: "", killing: true });
    try {
      const result = await portManagerUseCases.killProcesses(pids);
      const messages = portManagerUseCases.createKillMessages(result);
      usePortManagerStore.setState((state) => ({
        portKillMessages: { ...state.portKillMessages, [port]: messages },
      }));
      void portManagerOperations.scan([port]);
    } catch (error) {
      usePortManagerStore.setState({ error: typeof error === "string" ? error : "Failed to kill process" });
    } finally {
      usePortManagerStore.setState({ killing: false });
    }
  },

  async killAll() {
    const { portDetails } = usePortManagerStore.getState();
    usePortManagerStore.setState({ error: "", killing: true });
    try {
      const allPids = portDetails.flatMap((detail) => detail.pids);
      const portsToRescan = portDetails.map((detail) => detail.port);
      const result = await portManagerUseCases.killProcesses(allPids);
      const killMessages = portManagerUseCases.groupKillMessagesByPort(result, portDetails);
      usePortManagerStore.setState({ portKillMessages: killMessages });
      if (portsToRescan.length > 0) {
        void portManagerOperations.scan(portsToRescan);
      }
    } catch (error) {
      usePortManagerStore.setState({ error: typeof error === "string" ? error : "Failed to kill processes" });
    } finally {
      usePortManagerStore.setState({ killing: false });
    }
  },
};

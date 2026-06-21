/**
 * Controller / 控制器: bind view events and use cases; 连接视图事件与用例.
 */
import { createElement, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { portManagerUseCases } from "@/features/port-manager/services/port-manager.use-cases";
import { hasInvalidPortInputCharacters, parsePortsFromInput } from "@/features/port-manager/ports";
import { registerFeatureRefresh } from "@/features/refresh";
import {
  MAX_TRACKED_PORTS,
  usePortManagerStore,
  type PortScanStatus,
  PORT_SCAN_STATUS_META,
} from "@/features/port-manager/store";
import { canUseDesktopFeatures } from "@/platform/capabilities";
import { localizeError } from "@/lib/errors";

export const commonPorts = [3000, 5173, 1420, 8080, 5000, 4200, 8000, 4321, 6006, 1234, 9000];

export const chipStatusClasses: Record<PortScanStatus, string> = {
  waiting: "opacity-65 bg-muted border-muted-foreground/20 text-muted-foreground",
  scanning: "bg-indigo-50 border-indigo-300 text-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-800 dark:text-indigo-300 animate-pulse",
  success: "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300",
  empty: "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-300",
  error: "bg-red-50 border-red-300 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300",
  ended: "opacity-50 bg-muted border-dashed border-muted-foreground/30 text-muted-foreground",
};

export function usePortManagerController() {
  const { t } = useTranslation();

  const inputRef = useRef<HTMLInputElement>(null!);
  const invalidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null!);

  const inputValue = usePortManagerStore((s) => s.inputValue);
  const showInvalidToast = usePortManagerStore((s) => s.showInvalidToast);
  const inputError = usePortManagerStore((s) => s.inputError);
  const portStates = usePortManagerStore((s) => s.portStates);
  const portDetails = usePortManagerStore((s) => s.portDetails);
  const killing = usePortManagerStore((s) => s.killing);
  const portKillMessages = usePortManagerStore((s) => s.portKillMessages);
  const error = usePortManagerStore((s) => s.error);
  const showEmptyPorts = usePortManagerStore((s) => s.showEmptyPorts);
  const highlightPort = usePortManagerStore((s) => s.highlightPort);

  const setInputValue = usePortManagerStore((s) => s.setInputValue);
  const setShowInvalidToast = usePortManagerStore((s) => s.setShowInvalidToast);
  const setInputError = usePortManagerStore((s) => s.setInputError);
  const setError = usePortManagerStore((s) => s.setError);
  const setShowEmptyPorts = usePortManagerStore((s) => s.setShowEmptyPorts);
  const setHighlightPort = usePortManagerStore((s) => s.setHighlightPort);
  const removePort = usePortManagerStore((s) => s.removePort);
  const clearAll = usePortManagerStore((s) => s.clearAll);

  const canUsePlatformFeatures = canUseDesktopFeatures();
  const isScanning = portStates.some((ps) => ps.status === "scanning");

  const addPortsToScan = useCallback((ports: number[]) => {
    const { portStates: currentPortStates } = usePortManagerStore.getState();
    const updatedPorts = [...currentPortStates];
    const portsToAdd: number[] = [];

    for (const port of ports) {
      if (updatedPorts.length >= MAX_TRACKED_PORTS) break;
      if (updatedPorts.some((ps) => ps.port === port)) continue;
      updatedPorts.push({ port, status: "waiting" });
      portsToAdd.push(port);
    }

    if (portsToAdd.length > 0) {
      updatedPorts.sort((left, right) => left.port - right.port);
      usePortManagerStore.setState({ portStates: updatedPorts });
    }

    return portsToAdd;
  }, []);

  const scan = useCallback(async (portsToScan: number[]) => {
    if (!portManagerUseCases.isAvailable()) {
      usePortManagerStore.setState({
        error: { key: "portManager.errors.desktopOnly" },
      });
      return;
    }
    if (portsToScan.length === 0) return;

    const sessionId = usePortManagerStore.getState().scanSession;

    usePortManagerStore.setState((state) => ({
      error: null,
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

        usePortManagerStore.setState((state) => {
          // The user may have removed this port between scan kickoff and the
          // result arriving; drop stale details so removed rows don't reappear (#090).
          const trackedPorts = new Set(state.portStates.map((ps) => ps.port));
          const fresh = details.filter((detail) => trackedPorts.has(detail.port));
          return {
            portDetails: [...state.portDetails, ...fresh],
            portStates: state.portStates.map((ps) =>
              ps.port === port ? { ...ps, status: (isOccupied ? "success" : "empty") as PortScanStatus } : ps
            ),
          };
        });
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
  }, []);

  const rescanAll = useCallback(() => {
    const allPorts = usePortManagerStore.getState().portStates.map((ps) => ps.port);
    if (allPorts.length === 0) return;

    usePortManagerStore.setState((state) => ({
      portStates: state.portStates.map((ps) => ({ ...ps, status: "waiting" as PortScanStatus })),
    }));
    void scan(allPorts);
  }, [scan]);

  const killPort = useCallback(
    async (port: number, pids: number[]) => {
      usePortManagerStore.setState({ error: null, killing: true });
      try {
        const { portDetails: currentDetails } = usePortManagerStore.getState();
        const targets = portManagerUseCases.buildKillTargets(pids, currentDetails);
        const result = await portManagerUseCases.killProcesses(targets);
        const messages = portManagerUseCases.createKillMessages(result);
        usePortManagerStore.setState((state) => ({
          portKillMessages: { ...state.portKillMessages, [port]: messages },
        }));
        void scan([port]);
      } catch (error) {
        usePortManagerStore.setState({
          error: {
            key: "portManager.errors.killOneFailed",
            fallback: typeof error === "string" ? error : undefined,
          },
        });
      } finally {
        usePortManagerStore.setState({ killing: false });
      }
    },
    [scan]
  );

  const killAll = useCallback(async () => {
    const { portDetails: currentPortDetails } = usePortManagerStore.getState();
    usePortManagerStore.setState({ error: null, killing: true });
    try {
      const allPids = currentPortDetails.flatMap((detail) => detail.pids);
      const portsToRescan = currentPortDetails.map((detail) => detail.port);
      const targets = portManagerUseCases.buildKillTargets(allPids, currentPortDetails);
      const result = await portManagerUseCases.killProcesses(targets);
      const killMessages = portManagerUseCases.groupKillMessagesByPort(result, currentPortDetails);
      usePortManagerStore.setState({ portKillMessages: killMessages });
      if (portsToRescan.length > 0) {
        void scan(portsToRescan);
      }
    } catch (error) {
      usePortManagerStore.setState({
        error: {
          key: "portManager.errors.killAllFailed",
          fallback: typeof error === "string" ? error : undefined,
        },
      });
    } finally {
      usePortManagerStore.setState({ killing: false });
    }
  }, [scan]);

  const clearInvalidTimer = useCallback(() => {
    if (invalidTimerRef.current) {
      clearTimeout(invalidTimerRef.current);
      invalidTimerRef.current = null;
    }
  }, []);

  const clearHighlightTimer = useCallback(() => {
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  }, []);

  const handleInvalidInput = useCallback(
    (message?: string) => {
      setShowInvalidToast(true);
      setInputError(message || t("portManager.invalidInput"));
      clearInvalidTimer();
      invalidTimerRef.current = setTimeout(() => {
        setInputValue("");
        setShowInvalidToast(false);
        setInputError("");
        invalidTimerRef.current = null;
      }, 3000);
    },
    [clearInvalidTimer, setInputValue, setShowInvalidToast, setInputError, t]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      setInputValue(raw);

      if (hasInvalidPortInputCharacters(raw)) {
        handleInvalidInput();
      } else {
        clearInvalidTimer();
        setShowInvalidToast(false);
      }
    },
    [clearInvalidTimer, handleInvalidInput, setInputValue, setShowInvalidToast]
  );

  const commitInput = useCallback(() => {
    const val = inputValue.trim();
    if (!val) return;

    const { ports: newPorts, hasError, errorKey } = /^[\d,\-]+$/.test(val)
      ? parsePortsFromInput(val)
      : { ports: [], hasError: true, errorKey: "invalidInput" as const };
    if (hasError) {
      handleInvalidInput(t(`portManager.${errorKey ?? "invalidInput"}`));
      return;
    }
    if (newPorts.length === 0) return;

    const existingPorts = usePortManagerStore.getState().portStates.map((ps) => ps.port);
    const portsToAdd = newPorts.filter((port) => !existingPorts.includes(port));
    if (portsToAdd.length === 0) {
      handleInvalidInput(t("portManager.portsAlreadyAdded"));
      return;
    }

    clearInvalidTimer();
    setShowInvalidToast(false);
    setInputValue("");

    const portsToAddFinal = addPortsToScan(portsToAdd);
    if (portsToAddFinal.length > 0) {
      void scan(portsToAddFinal);
    }
  }, [addPortsToScan, clearInvalidTimer, handleInvalidInput, inputValue, scan, setInputValue, setShowInvalidToast, t]);

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitInput();
      }
      if (event.key === "Backspace" && inputValue.length === 0 && portStates.length > 0) {
        removePort(portStates[portStates.length - 1].port);
      }
    },
    [commitInput, inputValue.length, portStates, removePort]
  );

  const handleScan = useCallback(() => {
    commitInput();
  }, [commitInput]);

  const addCommonPort = useCallback(
    (port: number) => {
      if (port < 1 || port > 65535) return;
      const store = usePortManagerStore.getState();
      if (store.portStates.some((ps) => ps.port === port)) return;
      const portsToAdd = addPortsToScan([port]);
      if (portsToAdd.length > 0) {
        void scan(portsToAdd);
      }
    },
    [addPortsToScan, scan]
  );

  const handleClearInput = useCallback(() => {
    clearInvalidTimer();
    setInputValue("");
    setShowInvalidToast(false);
    setInputError("");
    inputRef.current?.focus();
  }, [clearInvalidTimer, setInputError, setInputValue, setShowInvalidToast]);

  const scrollToPort = useCallback(
    (port: number) => {
      if (!scrollContentRef.current) return;
      const el = scrollContentRef.current.querySelector(`[data-port="${port}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightPort(port);
      clearHighlightTimer();
      highlightTimerRef.current = setTimeout(() => {
        setHighlightPort(null);
        highlightTimerRef.current = null;
      }, 2000);
    },
    [clearHighlightTimer, setHighlightPort]
  );

  const handleKillPort = useCallback(
    (port: number, pids: number[]) => {
      void killPort(port, pids);
    },
    [killPort]
  );

  const handleKillAll = useCallback(() => {
    void killAll();
  }, [killAll]);

  const handleRescanPort = useCallback(
    (port: number) => {
      void scan([port]);
    },
    [scan]
  );

  const displayedDetails = useMemo(
    () => (showEmptyPorts ? portDetails : portDetails.filter((d) => !d.error && d.pids.length > 0)),
    [portDetails, showEmptyPorts]
  );

  const occupiedCount = useMemo(
    () => portDetails.filter((d) => !d.error && d.pids.length > 0).length,
    [portDetails]
  );

  const statusIconFor = useCallback((status: PortScanStatus) => {
    switch (status) {
      case "waiting":
        return createElement("span", { className: "size-2 opacity-0" });
      case "scanning":
        return createElement("span", {
          className:
            "size-3 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-500 dark:border-indigo-800 dark:border-t-indigo-400",
        });
      case "success":
        return createElement("span", {
          className: "size-2 rounded-full bg-emerald-500 dark:bg-emerald-400",
        });
      case "empty":
        return createElement("span", {
          className: "size-2 rounded-full bg-blue-400 dark:bg-blue-300",
        });
      case "error":
        return createElement("span", {
          className: "size-2 rounded-full bg-red-500 dark:bg-red-400",
        });
      case "ended":
        return createElement("span", { className: "size-2 rounded-full bg-muted-foreground" });
    }
  }, []);

  useEffect(
    () => () => {
      clearInvalidTimer();
      clearHighlightTimer();
      // Zustand store is module-scoped and survives unmount; reset the highlight
      // explicitly so re-mounting the page doesn't show a stale highlight from
      // a previous visit that was navigated away before the 2s timer fired (#077).
      setHighlightPort(null);
    },
    [clearHighlightTimer, clearInvalidTimer, setHighlightPort]
  );

  useEffect(() => registerFeatureRefresh("port-manager", rescanAll), [rescanAll]);

  const errorMessage = error ? localizeError(t, error) : "";

  return {
    t,
    canUsePlatformFeatures,
    inputRef,
    scrollContentRef,
    inputValue,
    showInvalidToast,
    inputError,
    portStates,
    portDetails,
    killing,
    portKillMessages,
    error: errorMessage,
    showEmptyPorts,
    highlightPort,
    setShowEmptyPorts,
    clearAll,
    rescanAll,
    removePort,
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
    occupiedCount,
    displayedDetails,
    isScanning,
    statusIconFor,
    PORT_SCAN_STATUS_META,
  };
}

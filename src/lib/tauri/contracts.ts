import type {
  AppScanResult,
  BatchOperationResult,
  InstallSource,
  OperationRecord,
  OperationResult,
} from "@/lib/tauri/types/app-manager";
import type {
  CleanupResult,
  ProjectInfo,
  ScanResult,
} from "@/lib/tauri/types/dev-cleaner";
import type { EnvScanDonePayload } from "@/lib/tauri/types/env-detector";
import type {
  KillPidResult,
  PortProcessDetail,
} from "@/lib/tauri/types/port-manager";
import type { SystemInfoData } from "@/lib/tauri/types/system-info";

export const TAURI_COMMANDS = {
  appManager: {
    scanInstalledApps: "scan_installed_apps",
    launchApp: "launch_app",
    revealAppInFinder: "reveal_app_in_finder",
    checkManagedAppUpdates: "check_managed_app_updates",
    upgradeApp: "upgrade_app",
    uninstallApp: "uninstall_app",
    getAppOperationHistory: "get_app_operation_history",
    batchUpgradeApps: "batch_upgrade_apps",
    batchUninstallApps: "batch_uninstall_apps",
    refreshAppUpdates: "refresh_app_updates",
    installApp: "install_app",
    batchInstallApps: "batch_install_apps",
  },
  devCleaner: {
    scanDevProjects: "scan_dev_projects",
    cleanupProjects: "cleanup_projects",
    stopScan: "stop_scan",
  },
  envDetector: {
    detectEnvTools: "detect_env_tools",
  },
  portManager: {
    getSystemInfo: "get_system_info",
    queryPortProcesses: "query_port_processes",
    killProcesses: "kill_processes",
  },
} as const;

export const TAURI_EVENTS = {
  envDetector: {
    scanDone: "env-scan-done",
  },
} as const;

export interface TauriCommandContracts {
  scan_installed_apps: {
    args: undefined;
    result: AppScanResult;
  };
  launch_app: {
    args: { appPath: string };
    result: void;
  };
  reveal_app_in_finder: {
    args: { appPath: string };
    result: void;
  };
  check_managed_app_updates: {
    args: { appIds: string[] };
    result: string[];
  };
  upgrade_app: {
    args: { appId: string };
    result: OperationResult;
  };
  uninstall_app: {
    args: { appId: string };
    result: OperationResult;
  };
  get_app_operation_history: {
    args: { appId: string | null };
    result: OperationRecord[];
  };
  batch_upgrade_apps: {
    args: { appIds: string[] };
    result: BatchOperationResult;
  };
  batch_uninstall_apps: {
    args: { appIds: string[] };
    result: BatchOperationResult;
  };
  refresh_app_updates: {
    args: { appIds: string[] };
    result: string[];
  };
  install_app: {
    args: { appId: string; installSource: InstallSource };
    result: OperationResult;
  };
  batch_install_apps: {
    args: { items: { appId: string; installSource: InstallSource }[] };
    result: BatchOperationResult;
  };
  scan_dev_projects: {
    args: { rootPath: string };
    result: ScanResult;
  };
  cleanup_projects: {
    args: { projects: ProjectInfo[] };
    result: CleanupResult;
  };
  stop_scan: {
    args: undefined;
    result: void;
  };
  detect_env_tools: {
    args: undefined;
    result: void;
  };
  get_system_info: {
    args: undefined;
    result: SystemInfoData;
  };
  query_port_processes: {
    args: { ports: number[] };
    result: PortProcessDetail[];
  };
  kill_processes: {
    args: { pids: number[] };
    result: KillPidResult[];
  };
}

export interface TauriEventContracts {
  "env-scan-done": EnvScanDonePayload;
}

export type TauriCommandName = keyof TauriCommandContracts;

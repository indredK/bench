/**
 * IPC Contracts / 通信契约: define command/event contracts; 只定义命令与事件契约.
 */
import type {
  AppScanResult,
  AppIconBase64,
  BatchOperationResult,
  InstallFinishedEvent,
  InstallProgressEvent,
  InstallSource,
  OperationResult,
  UpdateInfo,
} from "@/lib/tauri/types/app-manager";
import type {
  CleanupResult,
  ProjectInfo,
  ScanResult,
} from "@/lib/tauri/types/dev-cleaner";
import type { EnvScanDonePayload } from "@/lib/tauri/types/env-detector";
import type {
  KillPidResult,
  KillTarget,
  PortProcessDetail,
} from "@/lib/tauri/types/port-manager";
import type { SystemInfoData } from "@/lib/tauri/types/system-info";
import type {
  AppUpdateDownloadEvent,
  AppUpdateInfo,
  AppUpdateInstallResult,
} from "@/lib/tauri/types/updater";

type TauriCommandSpec<Name extends string, Args, Result> = {
  readonly name: Name;
  readonly __args?: Args;
  readonly __result?: Result;
};

function defineTauriCommand<Args, Result>() {
  return <const Name extends string>(name: Name) =>
    ({ name }) as TauriCommandSpec<Name, Args, Result>;
}

export const TAURI_COMMAND_CONTRACTS = {
  check_for_app_update: defineTauriCommand<undefined, AppUpdateInfo>()("check_for_app_update"),
  download_and_install_app_update: defineTauriCommand<undefined, AppUpdateInstallResult>()("download_and_install_app_update"),
  cancel_app_update_download: defineTauriCommand<undefined, void>()("cancel_app_update_download"),
  restart_after_update: defineTauriCommand<undefined, void>()("restart_after_update"),
  get_current_app_version: defineTauriCommand<undefined, string>()("get_current_app_version"),
  mark_main_ready: defineTauriCommand<undefined, void>()("mark_main_ready"),
  is_main_ready: defineTauriCommand<undefined, boolean>()("is_main_ready"),
  scan_installed_apps: defineTauriCommand<undefined, AppScanResult>()("scan_installed_apps"),
  get_app_icon_base64: defineTauriCommand<{ installPath: string }, AppIconBase64>()("get_app_icon_base64"),
  launch_app: defineTauriCommand<{ appPath: string }, void>()("launch_app"),
  reveal_app_in_finder: defineTauriCommand<{ appPath: string }, void>()("reveal_app_in_finder"),
  check_managed_app_updates: defineTauriCommand<{ appIds: string[] }, string[]>()("check_managed_app_updates"),
  upgrade_app: defineTauriCommand<{ appId: string }, OperationResult>()("upgrade_app"),
  uninstall_app: defineTauriCommand<{ appId: string }, OperationResult>()("uninstall_app"),
  batch_upgrade_apps: defineTauriCommand<{ appIds: string[] }, BatchOperationResult>()("batch_upgrade_apps"),
  batch_uninstall_apps: defineTauriCommand<{ appIds: string[] }, BatchOperationResult>()("batch_uninstall_apps"),
  refresh_app_updates: defineTauriCommand<{ appIds: string[] }, string[]>()("refresh_app_updates"),
  install_app: defineTauriCommand<{ appId: string; installSource: InstallSource }, OperationResult>()("install_app"),
  batch_install_apps: defineTauriCommand<{ items: { appId: string; installSource: InstallSource }[] }, BatchOperationResult>()("batch_install_apps"),
  cancel_batch_operation: defineTauriCommand<undefined, boolean>()("cancel_batch_operation"),
  check_all_app_updates: defineTauriCommand<{ forceRefresh?: boolean }, UpdateInfo[]>()("check_all_app_updates"),
  open_in_mac_app_store: defineTauriCommand<{ adamId: string }, void>()("open_in_mac_app_store"),
  open_in_mac_app_store_updates: defineTauriCommand<undefined, void>()("open_in_mac_app_store_updates"),
  install_app_update: defineTauriCommand<{ update: UpdateInfo }, void>()("install_app_update"),
  cancel_app_update: defineTauriCommand<{ appId: string }, void>()("cancel_app_update"),
  confirm_developer_id_change: defineTauriCommand<{ appId: string; approved: boolean }, void>()("confirm_developer_id_change"),
  scan_dev_projects: defineTauriCommand<{ rootPath: string }, ScanResult>()("scan_dev_projects"),
  cleanup_projects: defineTauriCommand<{ projects: ProjectInfo[] }, CleanupResult>()("cleanup_projects"),
  stop_scan: defineTauriCommand<undefined, void>()("stop_scan"),
  detect_env_tools: defineTauriCommand<undefined, void>()("detect_env_tools"),
  get_system_info: defineTauriCommand<undefined, SystemInfoData>()("get_system_info"),
  query_port_processes: defineTauriCommand<{ ports: number[] }, PortProcessDetail[]>()("query_port_processes"),
  kill_processes: defineTauriCommand<{ targets: KillTarget[] }, KillPidResult[]>()("kill_processes"),
} as const;

export type TauriCommandName = keyof typeof TAURI_COMMAND_CONTRACTS;

type CommandArgs<Spec> =
  Spec extends TauriCommandSpec<string, infer Args, unknown> ? Args : never;

type CommandResult<Spec> =
  Spec extends TauriCommandSpec<string, unknown, infer Result> ? Result : never;

export type TauriCommandContracts = {
  [Name in TauriCommandName]: {
    args: CommandArgs<(typeof TAURI_COMMAND_CONTRACTS)[Name]>;
    result: CommandResult<(typeof TAURI_COMMAND_CONTRACTS)[Name]>;
  };
};

type ContractNameMismatches = {
  [Name in TauriCommandName]: (typeof TAURI_COMMAND_CONTRACTS)[Name]["name"] extends Name
    ? Name extends (typeof TAURI_COMMAND_CONTRACTS)[Name]["name"]
      ? never
      : Name
    : Name;
}[TauriCommandName];

const _tauriCommandContractNamesMatchKeys: ContractNameMismatches extends never ? true : never = true;
void _tauriCommandContractNamesMatchKeys;

function commandName<Name extends TauriCommandName>(name: Name): Name {
  return TAURI_COMMAND_CONTRACTS[name].name as Name;
}

export const TAURI_COMMANDS = {
  updater: {
    checkForAppUpdate: commandName("check_for_app_update"),
    downloadAndInstallAppUpdate: commandName("download_and_install_app_update"),
    cancelAppUpdateDownload: commandName("cancel_app_update_download"),
    restartAfterUpdate: commandName("restart_after_update"),
    getCurrentAppVersion: commandName("get_current_app_version"),
  },
  bootstrap: {
    markMainReady: commandName("mark_main_ready"),
    isMainReady: commandName("is_main_ready"),
  },
  appManager: {
    scanInstalledApps: commandName("scan_installed_apps"),
    getAppIconBase64: commandName("get_app_icon_base64"),
    launchApp: commandName("launch_app"),
    revealAppInFinder: commandName("reveal_app_in_finder"),
    checkManagedAppUpdates: commandName("check_managed_app_updates"),
    upgradeApp: commandName("upgrade_app"),
    uninstallApp: commandName("uninstall_app"),
    batchUpgradeApps: commandName("batch_upgrade_apps"),
    batchUninstallApps: commandName("batch_uninstall_apps"),
    refreshAppUpdates: commandName("refresh_app_updates"),
    installApp: commandName("install_app"),
    batchInstallApps: commandName("batch_install_apps"),
    cancelBatchOperation: commandName("cancel_batch_operation"),
    checkAllAppUpdates: commandName("check_all_app_updates"),
    openInMacAppStore: commandName("open_in_mac_app_store"),
    openMacAppStoreUpdates: commandName("open_in_mac_app_store_updates"),
    installAppUpdate: commandName("install_app_update"),
    cancelAppUpdate: commandName("cancel_app_update"),
    confirmDeveloperIdChange: commandName("confirm_developer_id_change"),
  },
  devCleaner: {
    scanDevProjects: commandName("scan_dev_projects"),
    cleanupProjects: commandName("cleanup_projects"),
    stopScan: commandName("stop_scan"),
  },
  envDetector: {
    detectEnvTools: commandName("detect_env_tools"),
  },
  portManager: {
    getSystemInfo: commandName("get_system_info"),
    queryPortProcesses: commandName("query_port_processes"),
    killProcesses: commandName("kill_processes"),
  },
} as const;

type FlattenCommandGroups<T> = {
  [Group in keyof T]: T[Group] extends Record<string, infer Name> ? Name : never;
}[keyof T];

type TauriGroupedCommandName = FlattenCommandGroups<typeof TAURI_COMMANDS>;
type MissingGroupedCommands = Exclude<TauriCommandName, TauriGroupedCommandName>;
type ExtraGroupedCommands = Exclude<TauriGroupedCommandName, TauriCommandName>;

const _tauriCommandGroupsCoverContracts:
  [MissingGroupedCommands, ExtraGroupedCommands] extends [never, never] ? true : never = true;
void _tauriCommandGroupsCoverContracts;

type TauriCommandArgKeys = {
  [Name in TauriCommandName]: TauriCommandContracts[Name]["args"] extends undefined
    ? readonly []
    : readonly Extract<keyof TauriCommandContracts[Name]["args"], string>[];
};

export const TAURI_COMMAND_ARG_KEYS = {
  check_for_app_update: [],
  download_and_install_app_update: [],
  cancel_app_update_download: [],
  restart_after_update: [],
  get_current_app_version: [],
  mark_main_ready: [],
  is_main_ready: [],
  scan_installed_apps: [],
  get_app_icon_base64: ["installPath"],
  launch_app: ["appPath"],
  reveal_app_in_finder: ["appPath"],
  check_managed_app_updates: ["appIds"],
  upgrade_app: ["appId"],
  uninstall_app: ["appId"],
  batch_upgrade_apps: ["appIds"],
  batch_uninstall_apps: ["appIds"],
  refresh_app_updates: ["appIds"],
  install_app: ["appId", "installSource"],
  batch_install_apps: ["items"],
  cancel_batch_operation: [],
  check_all_app_updates: ["forceRefresh"],
  open_in_mac_app_store: ["adamId"],
  open_in_mac_app_store_updates: [],
  install_app_update: ["update"],
  cancel_app_update: ["appId"],
  confirm_developer_id_change: ["appId", "approved"],
  scan_dev_projects: ["rootPath"],
  cleanup_projects: ["projects"],
  stop_scan: [],
  detect_env_tools: [],
  get_system_info: [],
  query_port_processes: ["ports"],
  kill_processes: ["targets"],
} as const satisfies TauriCommandArgKeys;

export const WINDOW_BOOTSTRAP_EVENTS = {
  mainReady: "app-bootstrap-main-ready",
} as const;

export const TAURI_EVENTS = {
  updater: {
    download: "app-updater-download",
  },
  envDetector: {
    scanDone: "env-scan-done",
  },
  menu: {
    event: "menu-event",
  },
  appUpdateInstall: {
    progress: "app-update-install:progress",
    finished: "app-update-install:finished",
  },
} as const;

export interface TauriEventContracts {
  "app-updater-download": AppUpdateDownloadEvent;
  "env-scan-done": EnvScanDonePayload;
  "menu-event": string;
  "app-update-install:progress": InstallProgressEvent;
  "app-update-install:finished": InstallFinishedEvent;
}

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
  RelayDataExportResult,
  RelayDataImportResult,
  RelayExportMode,
  RelayStation,
  StationAccount,
  LoginMethod,
  LoginDetectionConfig,
} from "@/lib/tauri/types/api-billing";
import type {
  CleanupCommandDef,
  CleanupResult,
  CustomCleanupFinalResult,
  CustomCleanupProgress,
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
  Industry,
  Term,
  TermCategory,
  TermInput,
  TermSubcategory,
  TerminologyBundle,
} from "@/lib/tauri/types/terminology";
import type {
  ModelPricing,
  PricingStandard,
} from "@/lib/tauri/types/token-calculator";
import type {
  AppUpdateDownloadEvent,
  AppUpdateInfo,
  AppUpdateInstallResult,
} from "@/lib/tauri/types/updater";
import type { StartupIssue } from "@/lib/tauri/types/bootstrap";

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
  list_startup_issues: defineTauriCommand<undefined, StartupIssue[]>()("list_startup_issues"),
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
  get_custom_cleanup_commands: defineTauriCommand<undefined, CleanupCommandDef[]>()("get_custom_cleanup_commands"),
  execute_custom_cleanup: defineTauriCommand<{ commandIds: string[] }, CustomCleanupFinalResult>()("execute_custom_cleanup"),
  stop_custom_cleanup: defineTauriCommand<undefined, void>()("stop_custom_cleanup"),
  detect_env_tools: defineTauriCommand<undefined, void>()("detect_env_tools"),
  get_system_info: defineTauriCommand<undefined, SystemInfoData>()("get_system_info"),
  query_port_processes: defineTauriCommand<{ ports: number[] }, PortProcessDetail[]>()("query_port_processes"),
  kill_processes: defineTauriCommand<{ targets: KillTarget[] }, KillPidResult[]>()("kill_processes"),
  set_window_theme: defineTauriCommand<
    { theme: "default" | "glass"; appearance: "light" | "dark" },
    void
  >()("set_window_theme"),
  list_stations: defineTauriCommand<undefined, RelayStation[]>()("list_stations"),
  create_station: defineTauriCommand<
    { remark: string; website: string; loginDetection?: LoginDetectionConfig | null },
    RelayStation
  >()("create_station"),
  update_station: defineTauriCommand<
    {
      id: string;
      remark?: string | null;
      website?: string | null;
      loginDetection?: LoginDetectionConfig | null;
    },
    RelayStation
  >()("update_station"),
  delete_station: defineTauriCommand<{ id: string }, void>()("delete_station"),
  list_accounts: defineTauriCommand<{ stationId: string }, StationAccount[]>()(
    "list_accounts"
  ),
  list_all_accounts: defineTauriCommand<undefined, StationAccount[]>()(
    "list_all_accounts"
  ),
  create_account: defineTauriCommand<
    {
      stationId: string;
      username: string;
      password?: string | null;
      notes: string;
      phone?: string | null;
      tgAccount?: string | null;
      linkedAccount?: string | null;
      inviteLink?: string | null;
      loginMethods?: LoginMethod[];
    },
    StationAccount
  >()("create_account"),
  update_account: defineTauriCommand<
    { 
      id: string; 
      username?: string | null; 
      notes?: string | null;
      phone?: string | null;
      tgAccount?: string | null;
      linkedAccount?: string | null;
      inviteLink?: string | null;
      loginMethods?: LoginMethod[];
    },
    StationAccount
  >()("update_account"),
  delete_account: defineTauriCommand<{ id: string }, void>()("delete_account"),
  reveal_password: defineTauriCommand<{ accountId: string }, string>()(
    "reveal_password"
  ),
  set_password: defineTauriCommand<
    { accountId: string; password: string },
    void
  >()("set_password"),
  clear_password: defineTauriCommand<{ accountId: string }, void>()(
    "clear_password"
  ),
  copy_password_to_clipboard: defineTauriCommand<{ accountId: string }, void>()(
    "copy_password_to_clipboard"
  ),
  open_login_window: defineTauriCommand<{ accountId: string }, void>()(
    "open_login_window"
  ),
  mark_account_logged_in: defineTauriCommand<
    { accountId: string },
    StationAccount
  >()("mark_account_logged_in"),
  refresh_account: defineTauriCommand<{ accountId: string }, StationAccount>()(
    "refresh_account"
  ),
  refresh_station: defineTauriCommand<
    { stationId: string },
    StationAccount[]
  >()("refresh_station"),
  refresh_all: defineTauriCommand<undefined, StationAccount[]>()("refresh_all"),
  export_relay_data: defineTauriCommand<{ path: string; mode?: RelayExportMode | null }, RelayDataExportResult>()(
    "export_relay_data"
  ),
  import_relay_data: defineTauriCommand<{ path: string }, RelayDataImportResult>()(
    "import_relay_data"
  ),
  reorder_stations: defineTauriCommand<{ orderedIds: string[] }, RelayStation[]>()(
    "reorder_stations"
  ),
  reorder_accounts: defineTauriCommand<
    { stationId: string; orderedIds: string[] },
    StationAccount[]
  >()("reorder_accounts"),
  list_pricing_standards: defineTauriCommand<undefined, PricingStandard[]>()("list_pricing_standards"),
  create_pricing_standard: defineTauriCommand<
    { name: string; models: ModelPricing[] },
    PricingStandard
  >()("create_pricing_standard"),
  update_pricing_standard: defineTauriCommand<
    { id: string; name?: string | null; models?: ModelPricing[] | null },
    PricingStandard
  >()("update_pricing_standard"),
  delete_pricing_standard: defineTauriCommand<{ id: string }, void>()("delete_pricing_standard"),
  list_terminology_data: defineTauriCommand<undefined, TerminologyBundle>()("list_terminology_data"),
  create_industry: defineTauriCommand<{ label: string }, Industry>()("create_industry"),
  update_industry: defineTauriCommand<{ id: string; label: string }, Industry>()("update_industry"),
  delete_industry: defineTauriCommand<{ id: string }, void>()("delete_industry"),
  create_category: defineTauriCommand<{ industryId: string; label: string }, TermCategory>()("create_category"),
  update_category: defineTauriCommand<{ industryId: string; categoryId: string; label: string }, TermCategory>()("update_category"),
  delete_category: defineTauriCommand<{ industryId: string; categoryId: string }, void>()("delete_category"),
  create_subcategory: defineTauriCommand<
    { industryId: string; categoryId: string; label: string },
    TermSubcategory
  >()("create_subcategory"),
  update_subcategory: defineTauriCommand<
    { industryId: string; categoryId: string; subcategoryId: string; label: string },
    TermSubcategory
  >()("update_subcategory"),
  delete_subcategory: defineTauriCommand<
    { industryId: string; categoryId: string; subcategoryId: string },
    void
  >()("delete_subcategory"),
  create_term: defineTauriCommand<TermInput, Term>()("create_term"),
  update_term: defineTauriCommand<{ term: Term }, Term>()("update_term"),
  delete_term: defineTauriCommand<{ id: string }, void>()("delete_term"),
  set_term_pinned: defineTauriCommand<{ id: string; value: boolean }, void>()("set_term_pinned"),
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
    listStartupIssues: commandName("list_startup_issues"),
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
    getCustomCleanupCommands: commandName("get_custom_cleanup_commands"),
    executeCustomCleanup: commandName("execute_custom_cleanup"),
    stopCustomCleanup: commandName("stop_custom_cleanup"),
  },
  envDetector: {
    detectEnvTools: commandName("detect_env_tools"),
  },
  portManager: {
    getSystemInfo: commandName("get_system_info"),
    queryPortProcesses: commandName("query_port_processes"),
    killProcesses: commandName("kill_processes"),
  },
  windowTheme: {
    setWindowTheme: commandName("set_window_theme"),
  },
  apiBilling: {
    listStations: commandName("list_stations"),
    createStation: commandName("create_station"),
    updateStation: commandName("update_station"),
    deleteStation: commandName("delete_station"),
    listAccounts: commandName("list_accounts"),
    listAllAccounts: commandName("list_all_accounts"),
    createAccount: commandName("create_account"),
    updateAccount: commandName("update_account"),
    deleteAccount: commandName("delete_account"),
    revealPassword: commandName("reveal_password"),
    setPassword: commandName("set_password"),
    clearPassword: commandName("clear_password"),
    copyPasswordToClipboard: commandName("copy_password_to_clipboard"),
    openLoginWindow: commandName("open_login_window"),
    markAccountLoggedIn: commandName("mark_account_logged_in"),
    refreshAccount: commandName("refresh_account"),
    refreshStation: commandName("refresh_station"),
    refreshAll: commandName("refresh_all"),
    exportRelayData: commandName("export_relay_data"),
    importRelayData: commandName("import_relay_data"),
    reorderStations: commandName("reorder_stations"),
    reorderAccounts: commandName("reorder_accounts"),
  },
  tokenCalculator: {
    listPricingStandards: commandName("list_pricing_standards"),
    createPricingStandard: commandName("create_pricing_standard"),
    updatePricingStandard: commandName("update_pricing_standard"),
    deletePricingStandard: commandName("delete_pricing_standard"),
  },
  terminology: {
    listTerminologyData: commandName("list_terminology_data"),
    createIndustry: commandName("create_industry"),
    updateIndustry: commandName("update_industry"),
    deleteIndustry: commandName("delete_industry"),
    createCategory: commandName("create_category"),
    updateCategory: commandName("update_category"),
    deleteCategory: commandName("delete_category"),
    createSubcategory: commandName("create_subcategory"),
    updateSubcategory: commandName("update_subcategory"),
    deleteSubcategory: commandName("delete_subcategory"),
    createTerm: commandName("create_term"),
    updateTerm: commandName("update_term"),
    deleteTerm: commandName("delete_term"),
    setTermPinned: commandName("set_term_pinned"),
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
  list_startup_issues: [],
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
  get_custom_cleanup_commands: [],
  execute_custom_cleanup: ["commandIds"],
  stop_custom_cleanup: [],
  detect_env_tools: [],
  get_system_info: [],
  query_port_processes: ["ports"],
  kill_processes: ["targets"],
  set_window_theme: ["theme", "appearance"],
  list_stations: [],
  create_station: ["remark", "website", "loginDetection"],
  update_station: ["id", "remark", "website", "loginDetection"],
  delete_station: ["id"],
  list_accounts: ["stationId"],
  list_all_accounts: [],
  create_account: ["stationId", "username", "password", "notes", "phone", "tgAccount", "linkedAccount", "inviteLink", "loginMethods"],
  update_account: ["id", "username", "notes", "phone", "tgAccount", "linkedAccount", "inviteLink", "loginMethods"],
  delete_account: ["id"],
  reveal_password: ["accountId"],
  set_password: ["accountId", "password"],
  clear_password: ["accountId"],
  copy_password_to_clipboard: ["accountId"],
  open_login_window: ["accountId"],
  mark_account_logged_in: ["accountId"],
  refresh_account: ["accountId"],
  refresh_station: ["stationId"],
  refresh_all: [],
  export_relay_data: ["path", "mode"],
  import_relay_data: ["path"],
  reorder_stations: ["orderedIds"],
  reorder_accounts: ["stationId", "orderedIds"],
  list_pricing_standards: [],
  create_pricing_standard: ["name", "models"],
  update_pricing_standard: ["id", "name", "models"],
  delete_pricing_standard: ["id"],
  list_terminology_data: [],
  create_industry: ["label"],
  update_industry: ["id", "label"],
  delete_industry: ["id"],
  create_category: ["industryId", "label"],
  update_category: ["industryId", "categoryId", "label"],
  delete_category: ["industryId", "categoryId"],
  create_subcategory: ["industryId", "categoryId", "label"],
  update_subcategory: ["industryId", "categoryId", "subcategoryId", "label"],
  delete_subcategory: ["industryId", "categoryId", "subcategoryId"],
  create_term: ["industryId", "categoryId", "subcategoryId", "title", "description", "websites"],
  update_term: ["term"],
  delete_term: ["id"],
  set_term_pinned: ["id", "value"],
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
  customCleanup: {
    progress: "custom-cleanup:progress",
    completed: "custom-cleanup:completed",
  },
} as const;

export interface TauriEventContracts {
  "app-updater-download": AppUpdateDownloadEvent;
  "env-scan-done": EnvScanDonePayload;
  "menu-event": string;
  "app-update-install:progress": InstallProgressEvent;
  "app-update-install:finished": InstallFinishedEvent;
  "custom-cleanup:progress": CustomCleanupProgress;
  "custom-cleanup:completed": CustomCleanupFinalResult;
}

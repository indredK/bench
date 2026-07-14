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
  UpdateScanReport,
} from "@/lib/tauri/types/app-manager"
import type {
  AccountManagerCapabilities,
  AuthProfile,
  AuthProxyDrainResult,
  AuthProxyInboxStatus,
  AuthProxyResult,
  BrowserOpenResult,
  DeletionReport,
  ExternalApp,
  ExternalAppBinding,
  LoginDetectionConfig,
  LoginMethod,
  NetworkProxyConfig,
  PasswordAction,
  ProbeStrategy,
  RelayDataExportResult,
  RelayDataImportResult,
  RelayExportMode,
  RefreshReport,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager"
import type {
  CleanupCommandDef,
  CleanupResult,
  CustomCleanupFinalResult,
  CustomCleanupProgress,
  ProjectInfo,
  ScanResult,
} from "@/lib/tauri/types/dev-cleaner"
import type { EnvScanDonePayload } from "@/lib/tauri/types/env-detector"
import type { KillPidResult, KillTarget, PortProcessDetail } from "@/lib/tauri/types/port-manager"
import type {
  SleepConfig,
  SleepState,
  LoginItem,
  LaunchService,
  PingResult,
  PortCheckResult,
  IpInfo,
  WifiInfo,
  MenuBarAutoHideMode,
  LowPowerMode,
  SystemSettingsSnapshot,
} from "@/lib/tauri/types/system-settings"
import type { SystemInfoData } from "@/lib/tauri/types/system-info"
import type {
  Industry,
  Term,
  TermCategory,
  TermInput,
  TermSubcategory,
  TerminologyBundle,
} from "@/lib/tauri/types/terminology"
import type { ModelPricing, PricingStandard } from "@/lib/tauri/types/token-calculator"
import type {
  AppUpdateDownloadEvent,
  AppUpdateInfo,
  AppUpdateInstallResult,
} from "@/lib/tauri/types/updater"
import type { StartupIssue } from "@/lib/tauri/types/bootstrap"
import type {
  StorageOverview,
  StorageItem,
  StorageCategory,
  ScanStartPayload,
  CleanupRecord,
  FolderScanResult,
  CategoryCleanupResult,
  CleanupItemInput,
} from "@/lib/tauri/types/clean-space"

type TauriCommandSpec<Name extends string, Args, Result> = {
  readonly name: Name
  readonly __args?: Args
  readonly __result?: Result
}

function defineTauriCommand<Args, Result>() {
  return <const Name extends string>(name: Name) =>
    ({ name }) as TauriCommandSpec<Name, Args, Result>
}

export const TAURI_COMMAND_CONTRACTS = {
  check_for_app_update: defineTauriCommand<undefined, AppUpdateInfo>()("check_for_app_update"),
  download_and_install_app_update: defineTauriCommand<undefined, AppUpdateInstallResult>()(
    "download_and_install_app_update",
  ),
  cancel_app_update_download: defineTauriCommand<undefined, void>()("cancel_app_update_download"),
  restart_after_update: defineTauriCommand<undefined, void>()("restart_after_update"),
  get_current_app_version: defineTauriCommand<undefined, string>()("get_current_app_version"),
  mark_main_ready: defineTauriCommand<undefined, void>()("mark_main_ready"),
  is_main_ready: defineTauriCommand<undefined, boolean>()("is_main_ready"),
  list_startup_issues: defineTauriCommand<undefined, StartupIssue[]>()("list_startup_issues"),
  scan_installed_apps: defineTauriCommand<undefined, AppScanResult>()("scan_installed_apps"),
  cancel_app_inventory_scan: defineTauriCommand<undefined, boolean>()("cancel_app_inventory_scan"),
  get_app_icon_base64: defineTauriCommand<{ appId: string }, AppIconBase64>()(
    "get_app_icon_base64",
  ),
  launch_app: defineTauriCommand<{ appId: string }, void>()("launch_app"),
  reveal_app_in_finder: defineTauriCommand<{ appId: string }, void>()("reveal_app_in_finder"),
  authorize_mac_app: defineTauriCommand<{ appId: string }, OperationResult>()("authorize_mac_app"),
  check_managed_app_updates: defineTauriCommand<{ appIds: string[] }, string[]>()(
    "check_managed_app_updates",
  ),
  upgrade_app: defineTauriCommand<{ appId: string }, OperationResult>()("upgrade_app"),
  uninstall_app: defineTauriCommand<{ appId: string }, OperationResult>()("uninstall_app"),
  batch_upgrade_apps: defineTauriCommand<{ appIds: string[] }, BatchOperationResult>()(
    "batch_upgrade_apps",
  ),
  batch_uninstall_apps: defineTauriCommand<{ appIds: string[] }, BatchOperationResult>()(
    "batch_uninstall_apps",
  ),
  install_app: defineTauriCommand<
    { appId: string; installSource: InstallSource },
    OperationResult
  >()("install_app"),
  cancel_batch_operation: defineTauriCommand<undefined, boolean>()("cancel_batch_operation"),
  check_all_app_updates: defineTauriCommand<{ forceRefresh?: boolean }, UpdateScanReport>()(
    "check_all_app_updates",
  ),
  open_in_mac_app_store: defineTauriCommand<{ adamId: string }, void>()("open_in_mac_app_store"),
  open_in_mac_app_store_updates: defineTauriCommand<undefined, void>()(
    "open_in_mac_app_store_updates",
  ),
  install_app_update: defineTauriCommand<{ updateId: string; inventoryRevision: number }, void>()(
    "install_app_update",
  ),
  cancel_app_update: defineTauriCommand<{ appId: string }, void>()("cancel_app_update"),
  scan_dev_projects: defineTauriCommand<{ rootPath: string }, ScanResult>()("scan_dev_projects"),
  cleanup_projects: defineTauriCommand<{ projects: ProjectInfo[] }, CleanupResult>()(
    "cleanup_projects",
  ),
  stop_scan: defineTauriCommand<undefined, void>()("stop_scan"),
  get_custom_cleanup_commands: defineTauriCommand<undefined, CleanupCommandDef[]>()(
    "get_custom_cleanup_commands",
  ),
  execute_custom_cleanup: defineTauriCommand<{ commandIds: string[] }, CustomCleanupFinalResult>()(
    "execute_custom_cleanup",
  ),
  stop_custom_cleanup: defineTauriCommand<undefined, void>()("stop_custom_cleanup"),
  detect_env_tools: defineTauriCommand<undefined, void>()("detect_env_tools"),
  get_system_info: defineTauriCommand<undefined, SystemInfoData>()("get_system_info"),
  query_port_processes: defineTauriCommand<{ ports: number[] }, PortProcessDetail[]>()(
    "query_port_processes",
  ),
  kill_processes: defineTauriCommand<{ targets: KillTarget[] }, KillPidResult[]>()(
    "kill_processes",
  ),
  set_window_theme: defineTauriCommand<
    { theme: "default" | "glass"; appearance: "light" | "dark" },
    void
  >()("set_window_theme"),
  get_account_manager_capabilities: defineTauriCommand<undefined, AccountManagerCapabilities>()(
    "get_account_manager_capabilities",
  ),
  list_stations: defineTauriCommand<undefined, RelayStation[]>()("list_stations"),
  create_station: defineTauriCommand<
    { remark: string; website: string; loginDetection?: LoginDetectionConfig | null },
    RelayStation
  >()("create_station"),
  update_station: defineTauriCommand<
    {
      id: string
      remark?: string | null
      website?: string | null
      loginDetection?: LoginDetectionConfig | null
      sessionTtlHours?: number | null
    },
    RelayStation
  >()("update_station"),
  delete_station: defineTauriCommand<{ id: string }, DeletionReport>()("delete_station"),
  list_all_accounts: defineTauriCommand<undefined, StationAccount[]>()("list_all_accounts"),
  create_account: defineTauriCommand<
    {
      stationId: string
      username: string
      password?: string | null
      notes: string
      phone?: string | null
      tgAccount?: string | null
      linkedAccount?: string | null
      inviteLink?: string | null
      loginMethods?: LoginMethod[]
    },
    StationAccount
  >()("create_account"),
  update_account: defineTauriCommand<
    {
      id: string
      username?: string | null
      notes?: string | null
      phone?: string | null
      tgAccount?: string | null
      linkedAccount?: string | null
      inviteLink?: string | null
      loginMethods?: LoginMethod[]
    },
    StationAccount
  >()("update_account"),
  delete_account: defineTauriCommand<{ id: string }, DeletionReport>()("delete_account"),
  reveal_password: defineTauriCommand<{ accountId: string }, string>()("reveal_password"),
  set_password: defineTauriCommand<{ accountId: string; password: string }, void>()("set_password"),
  copy_password_to_clipboard: defineTauriCommand<{ accountId: string }, void>()(
    "copy_password_to_clipboard",
  ),
  open_login_window: defineTauriCommand<{ accountId: string; returnUrl?: string | null }, void>()(
    "open_login_window",
  ),
  refresh_account: defineTauriCommand<{ accountId: string }, StationAccount>()("refresh_account"),
  refresh_station: defineTauriCommand<{ stationId: string }, RefreshReport>()("refresh_station"),
  refresh_all: defineTauriCommand<undefined, RefreshReport>()("refresh_all"),
  export_relay_data: defineTauriCommand<
    { path: string; mode?: RelayExportMode | null },
    RelayDataExportResult
  >()("export_relay_data"),
  import_relay_data: defineTauriCommand<{ path: string }, RelayDataImportResult>()(
    "import_relay_data",
  ),
  reorder_stations: defineTauriCommand<{ orderedIds: string[] }, RelayStation[]>()(
    "reorder_stations",
  ),
  reorder_accounts: defineTauriCommand<
    { stationId: string; orderedIds: string[] },
    StationAccount[]
  >()("reorder_accounts"),
  detect_station_auth_profile: defineTauriCommand<
    { stationId: string; accountId?: string | null },
    AuthProfile
  >()("detect_station_auth_profile"),
  set_probe_strategy: defineTauriCommand<
    { stationId: string; strategy: ProbeStrategy },
    RelayStation
  >()("set_probe_strategy"),
  reset_probe_strategy: defineTauriCommand<{ stationId: string }, RelayStation>()(
    "reset_probe_strategy",
  ),
  create_ephemeral_account: defineTauriCommand<
    { website: string; username: string; stationId?: string | null },
    StationAccount
  >()("create_ephemeral_account"),
  set_session_ttl: defineTauriCommand<{ stationId: string; ttlHours: number }, RelayStation>()(
    "set_session_ttl",
  ),
  set_station_network_proxy: defineTauriCommand<
    {
      stationId: string
      config: NetworkProxyConfig | null
      passwordAction: PasswordAction
    },
    RelayStation
  >()("set_station_network_proxy"),
  set_account_proxy_enabled: defineTauriCommand<
    { accountId: string; enabled: boolean },
    StationAccount
  >()("set_account_proxy_enabled"),
  proxy_login: defineTauriCommand<{ accountId: string; ticketId: string }, AuthProxyResult>()(
    "proxy_login",
  ),
  handle_browser_open: defineTauriCommand<{ url: string }, BrowserOpenResult>()(
    "handle_browser_open",
  ),
  get_auth_proxy_inbox_status: defineTauriCommand<undefined, AuthProxyInboxStatus>()(
    "get_auth_proxy_inbox_status",
  ),
  drain_auth_proxy_request: defineTauriCommand<undefined, AuthProxyDrainResult>()(
    "drain_auth_proxy_request",
  ),
  proxy_login_new_account: defineTauriCommand<
    {
      ticketId: string
      username?: string | null
    },
    StationAccount
  >()("proxy_login_new_account"),
  list_external_apps: defineTauriCommand<
    { stationId?: string | null; accountId?: string | null },
    ExternalApp[]
  >()("list_external_apps"),
  remove_external_app: defineTauriCommand<{ appId: string }, void>()("remove_external_app"),
  list_external_app_bindings: defineTauriCommand<
    { accountId?: string | null },
    ExternalAppBinding[]
  >()("list_external_app_bindings"),
  list_pricing_standards: defineTauriCommand<undefined, PricingStandard[]>()(
    "list_pricing_standards",
  ),
  create_pricing_standard: defineTauriCommand<
    { name: string; models: ModelPricing[] },
    PricingStandard
  >()("create_pricing_standard"),
  update_pricing_standard: defineTauriCommand<
    { id: string; name?: string | null; models?: ModelPricing[] | null },
    PricingStandard
  >()("update_pricing_standard"),
  delete_pricing_standard: defineTauriCommand<{ id: string }, void>()("delete_pricing_standard"),
  list_terminology_data: defineTauriCommand<undefined, TerminologyBundle>()(
    "list_terminology_data",
  ),
  create_industry: defineTauriCommand<{ label: string }, Industry>()("create_industry"),
  update_industry: defineTauriCommand<{ id: string; label: string }, Industry>()("update_industry"),
  delete_industry: defineTauriCommand<{ id: string }, void>()("delete_industry"),
  create_category: defineTauriCommand<{ industryId: string; label: string }, TermCategory>()(
    "create_category",
  ),
  update_category: defineTauriCommand<
    { industryId: string; categoryId: string; label: string },
    TermCategory
  >()("update_category"),
  delete_category: defineTauriCommand<{ industryId: string; categoryId: string }, void>()(
    "delete_category",
  ),
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
  // sleep inhibitor
  toggle_sleep_inhibitor: defineTauriCommand<
    { config: SleepConfig; enabled: boolean },
    SleepState
  >()("toggle_sleep_inhibitor"),
  get_sleep_inhibitor_state: defineTauriCommand<undefined, SleepState>()(
    "get_sleep_inhibitor_state",
  ),
  // system settings - finder
  set_finder_show_hidden_files: defineTauriCommand<{ show: boolean }, void>()(
    "set_finder_show_hidden_files",
  ),
  set_finder_show_pathbar: defineTauriCommand<{ show: boolean }, void>()("set_finder_show_pathbar"),
  set_finder_show_statusbar: defineTauriCommand<{ show: boolean }, void>()(
    "set_finder_show_statusbar",
  ),
  set_finder_show_library_dir: defineTauriCommand<{ show: boolean }, void>()(
    "set_finder_show_library_dir",
  ),
  set_finder_show_file_extensions: defineTauriCommand<{ show: boolean }, void>()(
    "set_finder_show_file_extensions",
  ),
  set_finder_no_ds_store: defineTauriCommand<{ noDs: boolean }, void>()("set_finder_no_ds_store"),
  // system settings - dock
  get_dock_orientation: defineTauriCommand<undefined, string>()("get_dock_orientation"),
  set_dock_orientation: defineTauriCommand<{ pos: string }, void>()("set_dock_orientation"),
  get_minimize_scale_enabled: defineTauriCommand<undefined, boolean>()(
    "get_minimize_scale_enabled",
  ),
  set_minimize_scale_enabled: defineTauriCommand<{ enabled: boolean }, void>()(
    "set_minimize_scale_enabled",
  ),
  // system settings - keyboard
  get_keyboard_fn_key_state: defineTauriCommand<undefined, boolean>()("get_keyboard_fn_key_state"),
  set_keyboard_fn_key_state: defineTauriCommand<{ useFn: boolean }, void>()(
    "set_keyboard_fn_key_state",
  ),
  get_auto_correct_state: defineTauriCommand<undefined, boolean>()("get_auto_correct_state"),
  set_auto_correct_state: defineTauriCommand<{ enabled: boolean }, void>()(
    "set_auto_correct_state",
  ),
  get_smart_quotes_state: defineTauriCommand<undefined, boolean>()("get_smart_quotes_state"),
  set_smart_quotes_state: defineTauriCommand<{ enabled: boolean }, void>()(
    "set_smart_quotes_state",
  ),
  get_smart_dashes_state: defineTauriCommand<undefined, boolean>()("get_smart_dashes_state"),
  set_smart_dashes_state: defineTauriCommand<{ enabled: boolean }, void>()(
    "set_smart_dashes_state",
  ),
  get_auto_capitalize_state: defineTauriCommand<undefined, boolean>()("get_auto_capitalize_state"),
  set_auto_capitalize_state: defineTauriCommand<{ enabled: boolean }, void>()(
    "set_auto_capitalize_state",
  ),
  // system settings - display
  get_display_battery_percent: defineTauriCommand<undefined, boolean>()(
    "get_display_battery_percent",
  ),
  set_display_battery_percent: defineTauriCommand<{ show: boolean }, void>()(
    "set_display_battery_percent",
  ),
  // system settings - network
  set_network_firewall_state: defineTauriCommand<{ enable: boolean }, void>()(
    "set_network_firewall_state",
  ),
  set_network_ssh_state: defineTauriCommand<{ enable: boolean }, void>()("set_network_ssh_state"),
  set_network_screen_sharing_state: defineTauriCommand<{ enable: boolean }, void>()(
    "set_network_screen_sharing_state",
  ),
  set_network_airdrop_disabled: defineTauriCommand<{ disable: boolean }, void>()(
    "set_network_airdrop_disabled",
  ),
  // system settings - screenshot
  set_screenshot_format: defineTauriCommand<{ format: string }, void>()("set_screenshot_format"),
  set_screenshot_disable_shadow: defineTauriCommand<{ disable: boolean }, void>()(
    "set_screenshot_disable_shadow",
  ),
  set_screenshot_show_thumbnail: defineTauriCommand<{ show: boolean }, void>()(
    "set_screenshot_show_thumbnail",
  ),
  set_screenshot_save_location: defineTauriCommand<{ path: string }, void>()(
    "set_screenshot_save_location",
  ),
  get_system_settings_snapshot: defineTauriCommand<undefined, SystemSettingsSnapshot>()(
    "get_system_settings_snapshot",
  ),
  // system settings - quick actions
  lock_screen: defineTauriCommand<undefined, void>()("lock_screen"),
  empty_trash: defineTauriCommand<undefined, string>()("empty_trash"),
  sleep_now: defineTauriCommand<undefined, void>()("sleep_now"),
  reboot_now: defineTauriCommand<undefined, void>()("reboot_now"),
  shutdown_now: defineTauriCommand<undefined, void>()("shutdown_now"),
  get_lock_screen_password_enabled: defineTauriCommand<undefined, boolean>()(
    "get_lock_screen_password_enabled",
  ),
  set_lock_screen_password_enabled: defineTauriCommand<{ enabled: boolean }, void>()(
    "set_lock_screen_password_enabled",
  ),
  get_lock_screen_password_delay: defineTauriCommand<undefined, number>()(
    "get_lock_screen_password_delay",
  ),
  set_lock_screen_password_delay: defineTauriCommand<{ seconds: number }, void>()(
    "set_lock_screen_password_delay",
  ),
  // system settings - default browser
  get_default_browser: defineTauriCommand<undefined, string>()("get_default_browser"),
  set_default_browser: defineTauriCommand<{ bundleId: string }, string>()("set_default_browser"),
  // system settings - semantic pane registry
  open_battery_settings: defineTauriCommand<undefined, void>()("open_battery_settings"),
  open_control_center_settings: defineTauriCommand<undefined, void>()(
    "open_control_center_settings",
  ),
  open_desktop_settings: defineTauriCommand<undefined, void>()("open_desktop_settings"),
  open_keyboard_settings: defineTauriCommand<undefined, void>()("open_keyboard_settings"),
  open_localization_settings: defineTauriCommand<undefined, void>()("open_localization_settings"),
  open_lock_screen_settings: defineTauriCommand<undefined, void>()("open_lock_screen_settings"),
  open_login_items_settings: defineTauriCommand<undefined, void>()("open_login_items_settings"),
  open_network_settings: defineTauriCommand<undefined, void>()("open_network_settings"),
  open_privacy_security_settings: defineTauriCommand<undefined, void>()(
    "open_privacy_security_settings",
  ),
  reset_tcc_permission: defineTauriCommand<{ service: string; bundleId: string }, void>()(
    "reset_tcc_permission",
  ),
  // system settings - login items
  get_login_items: defineTauriCommand<undefined, LoginItem[]>()("get_login_items"),
  remove_login_item: defineTauriCommand<{ name: string }, void>()("remove_login_item"),
  get_launch_agents: defineTauriCommand<undefined, LaunchService[]>()("get_launch_agents"),
  get_launch_daemons: defineTauriCommand<undefined, LaunchService[]>()("get_launch_daemons"),
  get_autostart_status: defineTauriCommand<undefined, boolean>()("get_autostart_status"),
  set_autostart: defineTauriCommand<{ enabled: boolean }, void>()("set_autostart"),
  // system settings - dev tools
  json_format: defineTauriCommand<{ input: string; indent: boolean }, string>()("json_format"),
  base64_encode: defineTauriCommand<{ input: string }, string>()("base64_encode"),
  base64_decode: defineTauriCommand<{ input: string }, string>()("base64_decode"),
  generate_uuid: defineTauriCommand<undefined, string>()("generate_uuid"),
  calculate_hash: defineTauriCommand<{ input: string; algorithm: string }, string>()(
    "calculate_hash",
  ),
  timestamp_convert: defineTauriCommand<{ ts: number; format: string }, string>()(
    "timestamp_convert",
  ),
  // system settings - network diagnostics
  ping_host: defineTauriCommand<{ host: string; count: number }, PingResult>()("ping_host"),
  port_check: defineTauriCommand<{ host: string; port: number }, PortCheckResult>()("port_check"),
  get_local_ip: defineTauriCommand<undefined, IpInfo>()("get_local_ip"),
  get_wifi_info: defineTauriCommand<undefined, WifiInfo>()("get_wifi_info"),
  // system settings - system toggles
  set_autohide_dock_state: defineTauriCommand<{ enabled: boolean }, void>()(
    "set_autohide_dock_state",
  ),
  set_autohide_menu_bar_state: defineTauriCommand<{ mode: MenuBarAutoHideMode }, void>()(
    "set_autohide_menu_bar_state",
  ),
  set_dock_show_recents_state: defineTauriCommand<{ enabled: boolean }, void>()(
    "set_dock_show_recents_state",
  ),
  set_hide_desktop_icons_state: defineTauriCommand<{ hide: boolean }, void>()(
    "set_hide_desktop_icons_state",
  ),
  set_low_power_mode_state: defineTauriCommand<{ mode: LowPowerMode }, void>()(
    "set_low_power_mode_state",
  ),
  set_screen_saver_state: defineTauriCommand<{ enabled: boolean }, void>()(
    "set_screen_saver_state",
  ),
  // file operations
  write_text_file: defineTauriCommand<{ path: string; content: string }, void>()("write_text_file"),
  // tray
  set_tray_labels: defineTauriCommand<
    { show: string; sleep: string; autostart: string; quit: string },
    void
  >()("set_tray_labels"),
  // app preferences
  get_close_behavior: defineTauriCommand<undefined, string>()("get_close_behavior"),
  set_close_behavior: defineTauriCommand<{ behavior: string }, void>()("set_close_behavior"),
  quit_app: defineTauriCommand<undefined, void>()("quit_app"),
  hide_main_window: defineTauriCommand<undefined, void>()("hide_main_window"),
  // clean space
  scan_storage_overview: defineTauriCommand<undefined, StorageOverview>()("scan_storage_overview"),
  scan_storage_stream: defineTauriCommand<undefined, void>()("scan_storage_stream"),
  get_category_items: defineTauriCommand<{ categoryId: string }, StorageItem[]>()(
    "get_category_items",
  ),
  execute_category_cleanup: defineTauriCommand<
    { items: CleanupItemInput[] },
    CategoryCleanupResult
  >()("execute_category_cleanup"),
  scan_custom_folder: defineTauriCommand<
    { folder: string; mtimeDays?: number; includeSubfolders?: boolean },
    FolderScanResult
  >()("scan_custom_folder"),
  open_system_storage_settings: defineTauriCommand<undefined, void>()(
    "open_system_storage_settings",
  ),
  get_cleanup_records: defineTauriCommand<undefined, CleanupRecord[]>()("get_cleanup_records"),
  add_cleanup_record: defineTauriCommand<{ record: CleanupRecord }, void>()("add_cleanup_record"),
} as const

export type TauriCommandName = keyof typeof TAURI_COMMAND_CONTRACTS

type CommandArgs<Spec> = Spec extends TauriCommandSpec<string, infer Args, unknown> ? Args : never

type CommandResult<Spec> =
  Spec extends TauriCommandSpec<string, unknown, infer Result> ? Result : never

export type TauriCommandContracts = {
  [Name in TauriCommandName]: {
    args: CommandArgs<(typeof TAURI_COMMAND_CONTRACTS)[Name]>
    result: CommandResult<(typeof TAURI_COMMAND_CONTRACTS)[Name]>
  }
}

type ContractNameMismatches = {
  [Name in TauriCommandName]: (typeof TAURI_COMMAND_CONTRACTS)[Name]["name"] extends Name
    ? Name extends (typeof TAURI_COMMAND_CONTRACTS)[Name]["name"]
      ? never
      : Name
    : Name
}[TauriCommandName]

const _tauriCommandContractNamesMatchKeys: ContractNameMismatches extends never ? true : never =
  true
void _tauriCommandContractNamesMatchKeys

function commandName<Name extends TauriCommandName>(name: Name): Name {
  return TAURI_COMMAND_CONTRACTS[name].name as Name
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
    cancelAppInventoryScan: commandName("cancel_app_inventory_scan"),
    getAppIconBase64: commandName("get_app_icon_base64"),
    launchApp: commandName("launch_app"),
    revealAppInFinder: commandName("reveal_app_in_finder"),
    authorizeMacApp: commandName("authorize_mac_app"),
    checkManagedAppUpdates: commandName("check_managed_app_updates"),
    upgradeApp: commandName("upgrade_app"),
    uninstallApp: commandName("uninstall_app"),
    batchUpgradeApps: commandName("batch_upgrade_apps"),
    batchUninstallApps: commandName("batch_uninstall_apps"),
    installApp: commandName("install_app"),
    cancelBatchOperation: commandName("cancel_batch_operation"),
    checkAllAppUpdates: commandName("check_all_app_updates"),
    openInMacAppStore: commandName("open_in_mac_app_store"),
    openMacAppStoreUpdates: commandName("open_in_mac_app_store_updates"),
    installAppUpdate: commandName("install_app_update"),
    cancelAppUpdate: commandName("cancel_app_update"),
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
  accountManager: {
    getCapabilities: commandName("get_account_manager_capabilities"),
    listStations: commandName("list_stations"),
    createStation: commandName("create_station"),
    updateStation: commandName("update_station"),
    deleteStation: commandName("delete_station"),
    listAllAccounts: commandName("list_all_accounts"),
    createAccount: commandName("create_account"),
    updateAccount: commandName("update_account"),
    deleteAccount: commandName("delete_account"),
    revealPassword: commandName("reveal_password"),
    setPassword: commandName("set_password"),
    copyPasswordToClipboard: commandName("copy_password_to_clipboard"),
    openLoginWindow: commandName("open_login_window"),
    refreshAccount: commandName("refresh_account"),
    refreshStation: commandName("refresh_station"),
    refreshAll: commandName("refresh_all"),
    exportRelayData: commandName("export_relay_data"),
    importRelayData: commandName("import_relay_data"),
    reorderStations: commandName("reorder_stations"),
    reorderAccounts: commandName("reorder_accounts"),
    detectStationAuthProfile: commandName("detect_station_auth_profile"),
    setProbeStrategy: commandName("set_probe_strategy"),
    resetProbeStrategy: commandName("reset_probe_strategy"),
    createEphemeralAccount: commandName("create_ephemeral_account"),
    setSessionTtl: commandName("set_session_ttl"),
    setStationNetworkProxy: commandName("set_station_network_proxy"),
    setAccountProxyEnabled: commandName("set_account_proxy_enabled"),
    proxyLogin: commandName("proxy_login"),
    handleBrowserOpen: commandName("handle_browser_open"),
    getAuthProxyInboxStatus: commandName("get_auth_proxy_inbox_status"),
    drainAuthProxyRequest: commandName("drain_auth_proxy_request"),
    proxyLoginNewAccount: commandName("proxy_login_new_account"),
    listExternalApps: commandName("list_external_apps"),
    removeExternalApp: commandName("remove_external_app"),
    listExternalAppBindings: commandName("list_external_app_bindings"),
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
  systemSettings: {
    toggleSleepInhibitor: commandName("toggle_sleep_inhibitor"),
    getSleepInhibitorState: commandName("get_sleep_inhibitor_state"),
    setFinderShowHiddenFiles: commandName("set_finder_show_hidden_files"),
    setFinderShowPathbar: commandName("set_finder_show_pathbar"),
    setFinderShowStatusbar: commandName("set_finder_show_statusbar"),
    setFinderShowLibraryDir: commandName("set_finder_show_library_dir"),
    setFinderShowFileExtensions: commandName("set_finder_show_file_extensions"),
    setFinderNoDsStore: commandName("set_finder_no_ds_store"),
    getDockOrientation: commandName("get_dock_orientation"),
    setDockOrientation: commandName("set_dock_orientation"),
    getMinimizeScaleEnabled: commandName("get_minimize_scale_enabled"),
    setMinimizeScaleEnabled: commandName("set_minimize_scale_enabled"),
    getKeyboardFnKeyState: commandName("get_keyboard_fn_key_state"),
    setKeyboardFnKeyState: commandName("set_keyboard_fn_key_state"),
    getAutoCorrectState: commandName("get_auto_correct_state"),
    setAutoCorrectState: commandName("set_auto_correct_state"),
    getSmartQuotesState: commandName("get_smart_quotes_state"),
    setSmartQuotesState: commandName("set_smart_quotes_state"),
    getSmartDashesState: commandName("get_smart_dashes_state"),
    setSmartDashesState: commandName("set_smart_dashes_state"),
    getAutoCapitalizeState: commandName("get_auto_capitalize_state"),
    setAutoCapitalizeState: commandName("set_auto_capitalize_state"),
    getDisplayBatteryPercent: commandName("get_display_battery_percent"),
    setDisplayBatteryPercent: commandName("set_display_battery_percent"),
    setNetworkFirewallState: commandName("set_network_firewall_state"),
    setNetworkSshState: commandName("set_network_ssh_state"),
    setNetworkScreenSharingState: commandName("set_network_screen_sharing_state"),
    setNetworkAirdropDisabled: commandName("set_network_airdrop_disabled"),
    setScreenshotFormat: commandName("set_screenshot_format"),
    setScreenshotDisableShadow: commandName("set_screenshot_disable_shadow"),
    setScreenshotShowThumbnail: commandName("set_screenshot_show_thumbnail"),
    setScreenshotSaveLocation: commandName("set_screenshot_save_location"),
    getSystemSettingsSnapshot: commandName("get_system_settings_snapshot"),
    lockScreen: commandName("lock_screen"),
    emptyTrash: commandName("empty_trash"),
    sleepNow: commandName("sleep_now"),
    rebootNow: commandName("reboot_now"),
    shutdownNow: commandName("shutdown_now"),
    getLockScreenPasswordEnabled: commandName("get_lock_screen_password_enabled"),
    setLockScreenPasswordEnabled: commandName("set_lock_screen_password_enabled"),
    getLockScreenPasswordDelay: commandName("get_lock_screen_password_delay"),
    setLockScreenPasswordDelay: commandName("set_lock_screen_password_delay"),
    getDefaultBrowser: commandName("get_default_browser"),
    setDefaultBrowser: commandName("set_default_browser"),
    openBatterySettings: commandName("open_battery_settings"),
    openControlCenterSettings: commandName("open_control_center_settings"),
    openDesktopSettings: commandName("open_desktop_settings"),
    openKeyboardSettings: commandName("open_keyboard_settings"),
    openLocalizationSettings: commandName("open_localization_settings"),
    openLockScreenSettings: commandName("open_lock_screen_settings"),
    openLoginItemsSettings: commandName("open_login_items_settings"),
    openNetworkSettings: commandName("open_network_settings"),
    openPrivacySecuritySettings: commandName("open_privacy_security_settings"),
    resetTccPermission: commandName("reset_tcc_permission"),
    getLoginItems: commandName("get_login_items"),
    removeLoginItem: commandName("remove_login_item"),
    getLaunchAgents: commandName("get_launch_agents"),
    getLaunchDaemons: commandName("get_launch_daemons"),
    getAutostartStatus: commandName("get_autostart_status"),
    setAutostart: commandName("set_autostart"),
    jsonFormat: commandName("json_format"),
    base64Encode: commandName("base64_encode"),
    base64Decode: commandName("base64_decode"),
    generateUuid: commandName("generate_uuid"),
    calculateHash: commandName("calculate_hash"),
    timestampConvert: commandName("timestamp_convert"),
    pingHost: commandName("ping_host"),
    portCheck: commandName("port_check"),
    getLocalIp: commandName("get_local_ip"),
    getWifiInfo: commandName("get_wifi_info"),
    setAutohideDockState: commandName("set_autohide_dock_state"),
    setAutohideMenuBarState: commandName("set_autohide_menu_bar_state"),
    setDockShowRecentsState: commandName("set_dock_show_recents_state"),
    setHideDesktopIconsState: commandName("set_hide_desktop_icons_state"),
    setLowPowerModeState: commandName("set_low_power_mode_state"),
    setScreenSaverState: commandName("set_screen_saver_state"),
  },
  fileOps: {
    writeTextFile: commandName("write_text_file"),
  },
  tray: {
    setTrayLabels: commandName("set_tray_labels"),
  },
  appPreferences: {
    getCloseBehavior: commandName("get_close_behavior"),
    setCloseBehavior: commandName("set_close_behavior"),
    quitApp: commandName("quit_app"),
    hideMainWindow: commandName("hide_main_window"),
  },
  cleanSpace: {
    scanStorageOverview: commandName("scan_storage_overview"),
    scanStorageStream: commandName("scan_storage_stream"),
    getCategoryItems: commandName("get_category_items"),
    executeCategoryCleanup: commandName("execute_category_cleanup"),
    scanCustomFolder: commandName("scan_custom_folder"),
    openSystemStorageSettings: commandName("open_system_storage_settings"),
    getCleanupRecords: commandName("get_cleanup_records"),
    addCleanupRecord: commandName("add_cleanup_record"),
  },
} as const

type FlattenCommandGroups<T> = {
  [Group in keyof T]: T[Group] extends Record<string, infer Name> ? Name : never
}[keyof T]

type TauriGroupedCommandName = FlattenCommandGroups<typeof TAURI_COMMANDS>
type MissingGroupedCommands = Exclude<TauriCommandName, TauriGroupedCommandName>
type ExtraGroupedCommands = Exclude<TauriGroupedCommandName, TauriCommandName>

const _tauriCommandGroupsCoverContracts: [MissingGroupedCommands, ExtraGroupedCommands] extends [
  never,
  never,
]
  ? true
  : never = true
void _tauriCommandGroupsCoverContracts

type TauriCommandArgKeys = {
  [Name in TauriCommandName]: TauriCommandContracts[Name]["args"] extends undefined
    ? readonly []
    : readonly Extract<keyof TauriCommandContracts[Name]["args"], string>[]
}

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
  cancel_app_inventory_scan: [],
  get_app_icon_base64: ["appId"],
  launch_app: ["appId"],
  reveal_app_in_finder: ["appId"],
  authorize_mac_app: ["appId"],
  check_managed_app_updates: ["appIds"],
  upgrade_app: ["appId"],
  uninstall_app: ["appId"],
  batch_upgrade_apps: ["appIds"],
  batch_uninstall_apps: ["appIds"],
  install_app: ["appId", "installSource"],
  cancel_batch_operation: [],
  check_all_app_updates: ["forceRefresh"],
  open_in_mac_app_store: ["adamId"],
  open_in_mac_app_store_updates: [],
  install_app_update: ["updateId", "inventoryRevision"],
  cancel_app_update: ["appId"],
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
  get_account_manager_capabilities: [],
  list_stations: [],
  create_station: ["remark", "website", "loginDetection"],
  update_station: ["id", "remark", "website", "loginDetection", "sessionTtlHours"],
  delete_station: ["id"],
  list_all_accounts: [],
  create_account: [
    "stationId",
    "username",
    "password",
    "notes",
    "phone",
    "tgAccount",
    "linkedAccount",
    "inviteLink",
    "loginMethods",
  ],
  update_account: [
    "id",
    "username",
    "notes",
    "phone",
    "tgAccount",
    "linkedAccount",
    "inviteLink",
    "loginMethods",
  ],
  delete_account: ["id"],
  reveal_password: ["accountId"],
  set_password: ["accountId", "password"],
  copy_password_to_clipboard: ["accountId"],
  open_login_window: ["accountId", "returnUrl"],
  refresh_account: ["accountId"],
  refresh_station: ["stationId"],
  refresh_all: [],
  export_relay_data: ["path", "mode"],
  import_relay_data: ["path"],
  reorder_stations: ["orderedIds"],
  reorder_accounts: ["stationId", "orderedIds"],
  detect_station_auth_profile: ["stationId", "accountId"],
  set_probe_strategy: ["stationId", "strategy"],
  reset_probe_strategy: ["stationId"],
  create_ephemeral_account: ["website", "username", "stationId"],
  set_session_ttl: ["stationId", "ttlHours"],
  set_station_network_proxy: ["stationId", "config", "passwordAction"],
  set_account_proxy_enabled: ["accountId", "enabled"],
  proxy_login: ["accountId", "ticketId"],
  handle_browser_open: ["url"],
  get_auth_proxy_inbox_status: [],
  drain_auth_proxy_request: [],
  proxy_login_new_account: ["ticketId", "username"],
  list_external_apps: ["stationId", "accountId"],
  remove_external_app: ["appId"],
  list_external_app_bindings: ["accountId"],
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
  // sleep inhibitor
  toggle_sleep_inhibitor: ["config", "enabled"],
  get_sleep_inhibitor_state: [],
  // system settings - finder
  set_finder_show_hidden_files: ["show"],
  set_finder_show_pathbar: ["show"],
  set_finder_show_statusbar: ["show"],
  set_finder_show_library_dir: ["show"],
  set_finder_show_file_extensions: ["show"],
  set_finder_no_ds_store: ["noDs"],
  // system settings - dock
  get_dock_orientation: [],
  set_dock_orientation: ["pos"],
  get_minimize_scale_enabled: [],
  set_minimize_scale_enabled: ["enabled"],
  // system settings - keyboard
  get_keyboard_fn_key_state: [],
  set_keyboard_fn_key_state: ["useFn"],
  get_auto_correct_state: [],
  set_auto_correct_state: ["enabled"],
  get_smart_quotes_state: [],
  set_smart_quotes_state: ["enabled"],
  get_smart_dashes_state: [],
  set_smart_dashes_state: ["enabled"],
  get_auto_capitalize_state: [],
  set_auto_capitalize_state: ["enabled"],
  // system settings - display
  get_display_battery_percent: [],
  set_display_battery_percent: ["show"],
  // system settings - network
  set_network_firewall_state: ["enable"],
  set_network_ssh_state: ["enable"],
  set_network_screen_sharing_state: ["enable"],
  set_network_airdrop_disabled: ["disable"],
  // system settings - screenshot
  set_screenshot_format: ["format"],
  set_screenshot_disable_shadow: ["disable"],
  set_screenshot_show_thumbnail: ["show"],
  set_screenshot_save_location: ["path"],
  get_system_settings_snapshot: [],
  // system settings - quick actions
  lock_screen: [],
  empty_trash: [],
  sleep_now: [],
  reboot_now: [],
  shutdown_now: [],
  get_lock_screen_password_enabled: [],
  set_lock_screen_password_enabled: ["enabled"],
  get_lock_screen_password_delay: [],
  set_lock_screen_password_delay: ["seconds"],
  // system settings - default browser
  get_default_browser: [],
  set_default_browser: ["bundleId"],
  // system settings - semantic pane registry
  open_battery_settings: [],
  open_control_center_settings: [],
  open_desktop_settings: [],
  open_keyboard_settings: [],
  open_localization_settings: [],
  open_lock_screen_settings: [],
  open_login_items_settings: [],
  open_network_settings: [],
  open_privacy_security_settings: [],
  reset_tcc_permission: ["service", "bundleId"],
  // system settings - login items
  get_login_items: [],
  remove_login_item: ["name"],
  get_launch_agents: [],
  get_launch_daemons: [],
  get_autostart_status: [],
  set_autostart: ["enabled"],
  // system settings - dev tools
  json_format: ["input", "indent"],
  base64_encode: ["input"],
  base64_decode: ["input"],
  generate_uuid: [],
  calculate_hash: ["input", "algorithm"],
  timestamp_convert: ["ts", "format"],
  // system settings - network diagnostics
  ping_host: ["host", "count"],
  port_check: ["host", "port"],
  get_local_ip: [],
  get_wifi_info: [],
  // system settings - system toggles
  set_autohide_dock_state: ["enabled"],
  set_autohide_menu_bar_state: ["mode"],
  set_dock_show_recents_state: ["enabled"],
  set_hide_desktop_icons_state: ["hide"],
  set_low_power_mode_state: ["mode"],
  set_screen_saver_state: ["enabled"],
  // file operations
  write_text_file: ["path", "content"],
  // tray
  set_tray_labels: ["show", "sleep", "autostart", "quit"],
  // app preferences
  get_close_behavior: [],
  set_close_behavior: ["behavior"],
  quit_app: [],
  hide_main_window: [],
  // clean space
  scan_storage_overview: [],
  scan_storage_stream: [],
  get_category_items: ["categoryId"],
  execute_category_cleanup: ["items"],
  scan_custom_folder: ["folder", "mtimeDays", "includeSubfolders"],
  open_system_storage_settings: [],
  get_cleanup_records: [],
  add_cleanup_record: ["record"],
} as const satisfies TauriCommandArgKeys

export const WINDOW_BOOTSTRAP_EVENTS = {
  mainReady: "app-bootstrap-main-ready",
} as const

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
  cleanSpace: {
    scanStart: "clean-space:scan-start",
    scanCategory: "clean-space:scan-category",
    scanComplete: "clean-space:scan-complete",
  },
  appPreferences: {
    showCloseBehaviorDialog: "show-close-behavior-dialog",
  },
  accountManager: {
    authProxyPending: "account-manager:auth-proxy-pending",
  },
} as const

export interface TauriEventContracts {
  "app-updater-download": AppUpdateDownloadEvent
  "env-scan-done": EnvScanDonePayload
  "menu-event": string
  "app-update-install:progress": InstallProgressEvent
  "app-update-install:finished": InstallFinishedEvent
  "custom-cleanup:progress": CustomCleanupProgress
  "custom-cleanup:completed": CustomCleanupFinalResult
  "clean-space:scan-start": ScanStartPayload
  "clean-space:scan-category": StorageCategory
  "clean-space:scan-complete": void
  "show-close-behavior-dialog": void
  "account-manager:auth-proxy-pending": AuthProxyInboxStatus
}

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
  AccountSessionStatus,
  AuthProfile,
  AuthProxyMatch,
  AuthProxyRequest,
  AuthProxyResult,
  BrowserOpenResult,
  ExclusivityMode,
  ExternalApp,
  ExternalAppBinding,
  LoginDetectionConfig,
  LoginMethod,
  NetworkProxyConfig,
  ProbeStrategy,
  RelayDataExportResult,
  RelayDataImportResult,
  RelayExportMode,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager";
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
import type {
  SleepConfig,
  SleepState,
  LoginItem,
  LaunchService,
  TccPermission,
  PingResult,
  DnsRecord,
  PortCheckResult,
  TracerouteHop,
  IpInfo,
  WifiInfo,
  MenuBarAutoHideMode,
  LowPowerMode,
  GatekeeperMode,
} from "@/lib/tauri/types/system-settings";
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
      sessionTtlHours?: number | null;
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
  open_login_window: defineTauriCommand<{ accountId: string; returnUrl?: string | null }, void>()(
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
  // Session Manager
  capture_account_session: defineTauriCommand<{ accountId: string }, AccountSessionStatus>()(
    "capture_account_session"
  ),
  restore_account_session: defineTauriCommand<{ accountId: string }, AccountSessionStatus>()(
    "restore_account_session"
  ),
  clear_account_session: defineTauriCommand<{ accountId: string }, void>()(
    "clear_account_session"
  ),
  detect_station_auth_profile: defineTauriCommand<
    { stationId: string; accountId?: string | null },
    AuthProfile
  >()(
    "detect_station_auth_profile"
  ),
  get_station_auth_profile: defineTauriCommand<{ stationId: string }, AuthProfile | null>()(
    "get_station_auth_profile"
  ),
  set_exclusivity_mode: defineTauriCommand<
    { stationId: string; mode: ExclusivityMode },
    RelayStation
  >()("set_exclusivity_mode"),
  switch_active_account: defineTauriCommand<
    { stationId: string; accountId: string },
    StationAccount
  >()("switch_active_account"),
  set_probe_strategy: defineTauriCommand<
    { stationId: string; strategy: ProbeStrategy },
    RelayStation
  >()("set_probe_strategy"),
  reset_probe_strategy: defineTauriCommand<{ stationId: string }, RelayStation>()(
    "reset_probe_strategy"
  ),
  create_ephemeral_account: defineTauriCommand<
    { website: string; username: string; stationId?: string | null },
    StationAccount
  >()("create_ephemeral_account"),
  set_session_ttl: defineTauriCommand<
    { stationId: string; ttlHours: number },
    RelayStation
  >()("set_session_ttl"),
  set_station_network_proxy: defineTauriCommand<
    {
      stationId: string;
      config: NetworkProxyConfig | null;
      password: string | null;
    },
    RelayStation
  >()("set_station_network_proxy"),
  get_station_network_proxy: defineTauriCommand<
    { stationId: string },
    NetworkProxyConfig | null
  >()("get_station_network_proxy"),
  set_account_proxy_enabled: defineTauriCommand<
    { accountId: string; enabled: boolean },
    StationAccount
  >()("set_account_proxy_enabled"),
  parse_auth_proxy_url: defineTauriCommand<
    { rawUrl: string },
    AuthProxyRequest
  >()("parse_auth_proxy_url"),
  match_proxy_target: defineTauriCommand<
    { target: string },
    AuthProxyMatch[]
  >()("match_proxy_target"),
  build_proxy_return_url: defineTauriCommand<
    { returnUrl: string; token: string; tokenType: string; state: string | null; stationId: string; accountId: string },
    string
  >()("build_proxy_return_url"),
  handle_auth_proxy: defineTauriCommand<
    {
      targetUrl: string;
      returnUrl: string;
      state?: string | null;
      siteHint?: string | null;
    },
    AuthProxyMatch[]
  >()("handle_auth_proxy"),
  proxy_login: defineTauriCommand<
    { accountId: string; targetUrl: string; returnUrl: string },
    AuthProxyResult
  >()("proxy_login"),
  handle_browser_open: defineTauriCommand<
    { url: string },
    BrowserOpenResult
  >()("handle_browser_open"),
  proxy_login_new_account: defineTauriCommand<
    {
      host: string;
      targetUrl: string;
      returnUrl: string;
      username?: string | null;
    },
    StationAccount
  >()("proxy_login_new_account"),
  list_external_apps: defineTauriCommand<
    { stationId?: string | null; accountId?: string | null },
    ExternalApp[]
  >()("list_external_apps"),
  register_external_app: defineTauriCommand<
    { name: string; urlScheme: string; returnHosts: string[] },
    ExternalApp
  >()("register_external_app"),
  remove_external_app: defineTauriCommand<{ appId: string }, void>()(
    "remove_external_app"
  ),
  list_external_app_bindings: defineTauriCommand<
    { accountId?: string | null },
    ExternalAppBinding[]
  >()("list_external_app_bindings"),
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
  // sleep inhibitor
  toggle_sleep_inhibitor: defineTauriCommand<{ config: SleepConfig; enabled: boolean }, SleepState>()("toggle_sleep_inhibitor"),
  get_sleep_inhibitor_state: defineTauriCommand<undefined, SleepState>()("get_sleep_inhibitor_state"),
  reset_sleep_inhibitor: defineTauriCommand<undefined, void>()("reset_sleep_inhibitor"),
  // system settings - finder
  get_finder_show_hidden_files: defineTauriCommand<undefined, boolean>()("get_finder_show_hidden_files"),
  set_finder_show_hidden_files: defineTauriCommand<{ show: boolean }, void>()("set_finder_show_hidden_files"),
  get_finder_show_pathbar: defineTauriCommand<undefined, boolean>()("get_finder_show_pathbar"),
  set_finder_show_pathbar: defineTauriCommand<{ show: boolean }, void>()("set_finder_show_pathbar"),
  get_finder_show_statusbar: defineTauriCommand<undefined, boolean>()("get_finder_show_statusbar"),
  set_finder_show_statusbar: defineTauriCommand<{ show: boolean }, void>()("set_finder_show_statusbar"),
  get_finder_show_library_dir: defineTauriCommand<undefined, boolean>()("get_finder_show_library_dir"),
  set_finder_show_library_dir: defineTauriCommand<{ show: boolean }, void>()("set_finder_show_library_dir"),
  get_finder_show_file_extensions: defineTauriCommand<undefined, boolean>()("get_finder_show_file_extensions"),
  set_finder_show_file_extensions: defineTauriCommand<{ show: boolean }, void>()("set_finder_show_file_extensions"),
  get_finder_spotlight_external_disk: defineTauriCommand<undefined, boolean>()("get_finder_spotlight_external_disk"),
  set_finder_spotlight_external_disk: defineTauriCommand<{ disk: string; enable: boolean }, void>()("set_finder_spotlight_external_disk"),
  get_finder_no_ds_store: defineTauriCommand<undefined, boolean>()("get_finder_no_ds_store"),
  set_finder_no_ds_store: defineTauriCommand<{ noDs: boolean }, void>()("set_finder_no_ds_store"),
  // system settings - dock
  get_dock_orientation: defineTauriCommand<undefined, string>()("get_dock_orientation"),
  set_dock_orientation: defineTauriCommand<{ pos: string }, void>()("set_dock_orientation"),
  get_minimize_scale_enabled: defineTauriCommand<undefined, boolean>()("get_minimize_scale_enabled"),
  set_minimize_scale_enabled: defineTauriCommand<{ enabled: boolean }, void>()("set_minimize_scale_enabled"),
  // system settings - keyboard
  get_keyboard_fn_key_state: defineTauriCommand<undefined, boolean>()("get_keyboard_fn_key_state"),
  set_keyboard_fn_key_state: defineTauriCommand<{ useFn: boolean }, void>()("set_keyboard_fn_key_state"),
  get_auto_correct_state: defineTauriCommand<undefined, boolean>()("get_auto_correct_state"),
  set_auto_correct_state: defineTauriCommand<{ enabled: boolean }, void>()("set_auto_correct_state"),
  get_smart_quotes_state: defineTauriCommand<undefined, boolean>()("get_smart_quotes_state"),
  set_smart_quotes_state: defineTauriCommand<{ enabled: boolean }, void>()("set_smart_quotes_state"),
  get_smart_dashes_state: defineTauriCommand<undefined, boolean>()("get_smart_dashes_state"),
  set_smart_dashes_state: defineTauriCommand<{ enabled: boolean }, void>()("set_smart_dashes_state"),
  get_auto_capitalize_state: defineTauriCommand<undefined, boolean>()("get_auto_capitalize_state"),
  set_auto_capitalize_state: defineTauriCommand<{ enabled: boolean }, void>()("set_auto_capitalize_state"),
  // system settings - display
  get_display_battery_percent: defineTauriCommand<undefined, boolean>()("get_display_battery_percent"),
  set_display_battery_percent: defineTauriCommand<{ show: boolean }, void>()("set_display_battery_percent"),
  // system settings - network
  get_network_firewall_state: defineTauriCommand<undefined, boolean>()("get_network_firewall_state"),
  set_network_firewall_state: defineTauriCommand<{ enable: boolean }, void>()("set_network_firewall_state"),
  get_network_ssh_state: defineTauriCommand<undefined, boolean>()("get_network_ssh_state"),
  set_network_ssh_state: defineTauriCommand<{ enable: boolean }, void>()("set_network_ssh_state"),
  get_network_screen_sharing_state: defineTauriCommand<undefined, boolean>()("get_network_screen_sharing_state"),
  set_network_screen_sharing_state: defineTauriCommand<{ enable: boolean }, void>()("set_network_screen_sharing_state"),
  get_network_airdrop_disabled: defineTauriCommand<undefined, boolean>()("get_network_airdrop_disabled"),
  set_network_airdrop_disabled: defineTauriCommand<{ disable: boolean }, void>()("set_network_airdrop_disabled"),
  // system settings - screenshot
  get_screenshot_format: defineTauriCommand<undefined, string>()("get_screenshot_format"),
  set_screenshot_format: defineTauriCommand<{ format: string }, void>()("set_screenshot_format"),
  get_screenshot_disable_shadow: defineTauriCommand<undefined, boolean>()("get_screenshot_disable_shadow"),
  set_screenshot_disable_shadow: defineTauriCommand<{ disable: boolean }, void>()("set_screenshot_disable_shadow"),
  get_screenshot_show_thumbnail: defineTauriCommand<undefined, boolean>()("get_screenshot_show_thumbnail"),
  set_screenshot_show_thumbnail: defineTauriCommand<{ show: boolean }, void>()("set_screenshot_show_thumbnail"),
  get_screenshot_save_location: defineTauriCommand<undefined, string>()("get_screenshot_save_location"),
  set_screenshot_save_location: defineTauriCommand<{ path: string }, void>()("set_screenshot_save_location"),
  // system settings - privacy
  get_tcc_permissions: defineTauriCommand<{ service: string }, TccPermission>()("get_tcc_permissions"),
  // system settings - maintenance
  rebuild_icon_cache: defineTauriCommand<undefined, string>()("rebuild_icon_cache"),
  flush_dns_cache: defineTauriCommand<undefined, string>()("flush_dns_cache"),
  rebuild_spotlight_index: defineTauriCommand<undefined, string>()("rebuild_spotlight_index"),
  reset_launch_services: defineTauriCommand<undefined, string>()("reset_launch_services"),
  flush_font_cache: defineTauriCommand<undefined, string>()("flush_font_cache"),
  // system settings - quick actions
  lock_screen: defineTauriCommand<undefined, void>()("lock_screen"),
  empty_trash: defineTauriCommand<undefined, string>()("empty_trash"),
  sleep_now: defineTauriCommand<undefined, void>()("sleep_now"),
  reboot_now: defineTauriCommand<undefined, void>()("reboot_now"),
  shutdown_now: defineTauriCommand<undefined, void>()("shutdown_now"),
  get_lock_screen_password_enabled: defineTauriCommand<undefined, boolean>()("get_lock_screen_password_enabled"),
  set_lock_screen_password_enabled: defineTauriCommand<{ enabled: boolean }, void>()("set_lock_screen_password_enabled"),
  get_lock_screen_password_delay: defineTauriCommand<undefined, number>()("get_lock_screen_password_delay"),
  set_lock_screen_password_delay: defineTauriCommand<{ seconds: number }, void>()("set_lock_screen_password_delay"),
  // system settings - default browser
  get_default_browser: defineTauriCommand<undefined, string>()("get_default_browser"),
  set_default_browser: defineTauriCommand<{ bundleId: string }, void>()("set_default_browser"),
  // system settings - semantic pane registry
  open_settings_pane: defineTauriCommand<{ pane: string }, void>()("open_settings_pane"),
  open_battery_settings: defineTauriCommand<undefined, void>()("open_battery_settings"),
  open_control_center_settings: defineTauriCommand<undefined, void>()("open_control_center_settings"),
  open_desktop_settings: defineTauriCommand<undefined, void>()("open_desktop_settings"),
  open_keyboard_settings: defineTauriCommand<undefined, void>()("open_keyboard_settings"),
  open_localization_settings: defineTauriCommand<undefined, void>()("open_localization_settings"),
  open_lock_screen_settings: defineTauriCommand<undefined, void>()("open_lock_screen_settings"),
  open_login_items_settings: defineTauriCommand<undefined, void>()("open_login_items_settings"),
  open_network_settings: defineTauriCommand<undefined, void>()("open_network_settings"),
  open_privacy_security_settings: defineTauriCommand<undefined, void>()("open_privacy_security_settings"),
  reset_tcc_permission: defineTauriCommand<{ service: string; bundleId: string }, void>()("reset_tcc_permission"),
  // system settings - gatekeeper
  get_gatekeeper_state: defineTauriCommand<undefined, GatekeeperMode>()("get_gatekeeper_state"),
  // system settings - login items
  get_login_items: defineTauriCommand<undefined, LoginItem[]>()("get_login_items"),
  add_login_item: defineTauriCommand<{ path: string }, void>()("add_login_item"),
  remove_login_item: defineTauriCommand<{ name: string }, void>()("remove_login_item"),
  get_launch_agents: defineTauriCommand<undefined, LaunchService[]>()("get_launch_agents"),
  get_launch_daemons: defineTauriCommand<undefined, LaunchService[]>()("get_launch_daemons"),
  // system settings - dev tools
  json_format: defineTauriCommand<{ input: string; indent: boolean }, string>()("json_format"),
  base64_encode: defineTauriCommand<{ input: string }, string>()("base64_encode"),
  base64_decode: defineTauriCommand<{ input: string }, string>()("base64_decode"),
  generate_uuid: defineTauriCommand<undefined, string>()("generate_uuid"),
  calculate_hash: defineTauriCommand<{ input: string; algorithm: string }, string>()("calculate_hash"),
  timestamp_convert: defineTauriCommand<{ ts: number; format: string }, string>()("timestamp_convert"),
  // system settings - network diagnostics
  ping_host: defineTauriCommand<{ host: string; count: number }, PingResult>()("ping_host"),
  dns_lookup: defineTauriCommand<{ domain: string; recordType: string }, DnsRecord[]>()("dns_lookup"),
  port_check: defineTauriCommand<{ host: string; port: number }, PortCheckResult>()("port_check"),
  traceroute_host: defineTauriCommand<{ host: string }, TracerouteHop[]>()("traceroute_host"),
  get_local_ip: defineTauriCommand<undefined, IpInfo>()("get_local_ip"),
  get_wifi_info: defineTauriCommand<undefined, WifiInfo>()("get_wifi_info"),
  // system settings - system toggles
  get_dark_mode_state: defineTauriCommand<undefined, boolean>()("get_dark_mode_state"),
  set_dark_mode_state: defineTauriCommand<{ enabled: boolean }, void>()("set_dark_mode_state"),
  get_autohide_dock_state: defineTauriCommand<undefined, boolean>()("get_autohide_dock_state"),
  set_autohide_dock_state: defineTauriCommand<{ enabled: boolean }, void>()("set_autohide_dock_state"),
  get_autohide_menu_bar_state: defineTauriCommand<undefined, MenuBarAutoHideMode>()("get_autohide_menu_bar_state"),
  set_autohide_menu_bar_state: defineTauriCommand<{ mode: MenuBarAutoHideMode }, void>()("set_autohide_menu_bar_state"),
  get_dock_show_recents_state: defineTauriCommand<undefined, boolean>()("get_dock_show_recents_state"),
  set_dock_show_recents_state: defineTauriCommand<{ enabled: boolean }, void>()("set_dock_show_recents_state"),
  get_hide_desktop_icons_state: defineTauriCommand<undefined, boolean>()("get_hide_desktop_icons_state"),
  set_hide_desktop_icons_state: defineTauriCommand<{ hide: boolean }, void>()("set_hide_desktop_icons_state"),
  get_low_power_mode_state: defineTauriCommand<undefined, LowPowerMode>()("get_low_power_mode_state"),
  set_low_power_mode_state: defineTauriCommand<{ mode: LowPowerMode }, void>()("set_low_power_mode_state"),
  get_screen_saver_state: defineTauriCommand<undefined, boolean>()("get_screen_saver_state"),
  set_screen_saver_state: defineTauriCommand<{ enabled: boolean }, void>()("set_screen_saver_state"),
  // file operations
  write_text_file: defineTauriCommand<{ path: string; content: string }, void>()("write_text_file"),
  read_text_file: defineTauriCommand<{ path: string }, string>()("read_text_file"),
  ensure_dir: defineTauriCommand<{ path: string }, void>()("ensure_dir"),
  file_exists: defineTauriCommand<{ path: string }, boolean>()("file_exists"),
  temp_dir: defineTauriCommand<undefined, string>()("temp_dir"),
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
  accountManager: {
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
    captureAccountSession: commandName("capture_account_session"),
    restoreAccountSession: commandName("restore_account_session"),
    clearAccountSession: commandName("clear_account_session"),
    detectStationAuthProfile: commandName("detect_station_auth_profile"),
    getStationAuthProfile: commandName("get_station_auth_profile"),
    setExclusivityMode: commandName("set_exclusivity_mode"),
    switchActiveAccount: commandName("switch_active_account"),
    setProbeStrategy: commandName("set_probe_strategy"),
    resetProbeStrategy: commandName("reset_probe_strategy"),
    createEphemeralAccount: commandName("create_ephemeral_account"),
    setSessionTtl: commandName("set_session_ttl"),
    setStationNetworkProxy: commandName("set_station_network_proxy"),
    getStationNetworkProxy: commandName("get_station_network_proxy"),
    setAccountProxyEnabled: commandName("set_account_proxy_enabled"),
    parseAuthProxyUrl: commandName("parse_auth_proxy_url"),
    matchProxyTarget: commandName("match_proxy_target"),
    buildProxyReturnUrl: commandName("build_proxy_return_url"),
    handleAuthProxy: commandName("handle_auth_proxy"),
    proxyLogin: commandName("proxy_login"),
    handleBrowserOpen: commandName("handle_browser_open"),
    proxyLoginNewAccount: commandName("proxy_login_new_account"),
    listExternalApps: commandName("list_external_apps"),
    registerExternalApp: commandName("register_external_app"),
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
    resetSleepInhibitor: commandName("reset_sleep_inhibitor"),
    getFinderShowHiddenFiles: commandName("get_finder_show_hidden_files"),
    setFinderShowHiddenFiles: commandName("set_finder_show_hidden_files"),
    getFinderShowPathbar: commandName("get_finder_show_pathbar"),
    setFinderShowPathbar: commandName("set_finder_show_pathbar"),
    getFinderShowStatusbar: commandName("get_finder_show_statusbar"),
    setFinderShowStatusbar: commandName("set_finder_show_statusbar"),
    getFinderShowLibraryDir: commandName("get_finder_show_library_dir"),
    setFinderShowLibraryDir: commandName("set_finder_show_library_dir"),
    getFinderShowFileExtensions: commandName("get_finder_show_file_extensions"),
    setFinderShowFileExtensions: commandName("set_finder_show_file_extensions"),
    getFinderSpotlightExternalDisk: commandName("get_finder_spotlight_external_disk"),
    setFinderSpotlightExternalDisk: commandName("set_finder_spotlight_external_disk"),
    getFinderNoDsStore: commandName("get_finder_no_ds_store"),
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
    getNetworkFirewallState: commandName("get_network_firewall_state"),
    setNetworkFirewallState: commandName("set_network_firewall_state"),
    getNetworkSshState: commandName("get_network_ssh_state"),
    setNetworkSshState: commandName("set_network_ssh_state"),
    getNetworkScreenSharingState: commandName("get_network_screen_sharing_state"),
    setNetworkScreenSharingState: commandName("set_network_screen_sharing_state"),
    getNetworkAirdropDisabled: commandName("get_network_airdrop_disabled"),
    setNetworkAirdropDisabled: commandName("set_network_airdrop_disabled"),
    getScreenshotFormat: commandName("get_screenshot_format"),
    setScreenshotFormat: commandName("set_screenshot_format"),
    getScreenshotDisableShadow: commandName("get_screenshot_disable_shadow"),
    setScreenshotDisableShadow: commandName("set_screenshot_disable_shadow"),
    getScreenshotShowThumbnail: commandName("get_screenshot_show_thumbnail"),
    setScreenshotShowThumbnail: commandName("set_screenshot_show_thumbnail"),
    getScreenshotSaveLocation: commandName("get_screenshot_save_location"),
    setScreenshotSaveLocation: commandName("set_screenshot_save_location"),
    getTccPermissions: commandName("get_tcc_permissions"),
    rebuildIconCache: commandName("rebuild_icon_cache"),
    flushDnsCache: commandName("flush_dns_cache"),
    rebuildSpotlightIndex: commandName("rebuild_spotlight_index"),
    resetLaunchServices: commandName("reset_launch_services"),
    flushFontCache: commandName("flush_font_cache"),
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
    openSettingsPane: commandName("open_settings_pane"),
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
    getGatekeeperState: commandName("get_gatekeeper_state"),
    getLoginItems: commandName("get_login_items"),
    addLoginItem: commandName("add_login_item"),
    removeLoginItem: commandName("remove_login_item"),
    getLaunchAgents: commandName("get_launch_agents"),
    getLaunchDaemons: commandName("get_launch_daemons"),
    jsonFormat: commandName("json_format"),
    base64Encode: commandName("base64_encode"),
    base64Decode: commandName("base64_decode"),
    generateUuid: commandName("generate_uuid"),
    calculateHash: commandName("calculate_hash"),
    timestampConvert: commandName("timestamp_convert"),
    pingHost: commandName("ping_host"),
    dnsLookup: commandName("dns_lookup"),
    portCheck: commandName("port_check"),
    tracerouteHost: commandName("traceroute_host"),
    getLocalIp: commandName("get_local_ip"),
    getWifiInfo: commandName("get_wifi_info"),
    getDarkModeState: commandName("get_dark_mode_state"),
    setDarkModeState: commandName("set_dark_mode_state"),
    getAutohideDockState: commandName("get_autohide_dock_state"),
    setAutohideDockState: commandName("set_autohide_dock_state"),
    getAutohideMenuBarState: commandName("get_autohide_menu_bar_state"),
    setAutohideMenuBarState: commandName("set_autohide_menu_bar_state"),
    getDockShowRecentsState: commandName("get_dock_show_recents_state"),
    setDockShowRecentsState: commandName("set_dock_show_recents_state"),
    getHideDesktopIconsState: commandName("get_hide_desktop_icons_state"),
    setHideDesktopIconsState: commandName("set_hide_desktop_icons_state"),
    getLowPowerModeState: commandName("get_low_power_mode_state"),
    setLowPowerModeState: commandName("set_low_power_mode_state"),
    getScreenSaverState: commandName("get_screen_saver_state"),
    setScreenSaverState: commandName("set_screen_saver_state"),
  },
  fileOps: {
    writeTextFile: commandName("write_text_file"),
    readTextFile: commandName("read_text_file"),
    ensureDir: commandName("ensure_dir"),
    fileExists: commandName("file_exists"),
    tempDir: commandName("temp_dir"),
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
  update_station: ["id", "remark", "website", "loginDetection", "sessionTtlHours"],
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
  open_login_window: ["accountId", "returnUrl"],
  mark_account_logged_in: ["accountId"],
  refresh_account: ["accountId"],
  refresh_station: ["stationId"],
  refresh_all: [],
  export_relay_data: ["path", "mode"],
  import_relay_data: ["path"],
  reorder_stations: ["orderedIds"],
  reorder_accounts: ["stationId", "orderedIds"],
  capture_account_session: ["accountId"],
  restore_account_session: ["accountId"],
  clear_account_session: ["accountId"],
  detect_station_auth_profile: ["stationId", "accountId"],
  get_station_auth_profile: ["stationId"],
  set_exclusivity_mode: ["stationId", "mode"],
  switch_active_account: ["stationId", "accountId"],
  set_probe_strategy: ["stationId", "strategy"],
  reset_probe_strategy: ["stationId"],
  create_ephemeral_account: ["website", "username", "stationId"],
  set_session_ttl: ["stationId", "ttlHours"],
  set_station_network_proxy: ["stationId", "config", "password"],
  get_station_network_proxy: ["stationId"],
  set_account_proxy_enabled: ["accountId", "enabled"],
  parse_auth_proxy_url: ["rawUrl"],
  match_proxy_target: ["target"],
  build_proxy_return_url: ["returnUrl", "token", "tokenType", "state", "stationId", "accountId"],
  handle_auth_proxy: ["targetUrl", "returnUrl", "state", "siteHint"],
  proxy_login: ["accountId", "targetUrl", "returnUrl"],
  handle_browser_open: ["url"],
  proxy_login_new_account: ["host", "targetUrl", "returnUrl", "username"],
  list_external_apps: ["stationId", "accountId"],
  register_external_app: ["name", "urlScheme", "returnHosts"],
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
  reset_sleep_inhibitor: [],
  // system settings - finder
  get_finder_show_hidden_files: [],
  set_finder_show_hidden_files: ["show"],
  get_finder_show_pathbar: [],
  set_finder_show_pathbar: ["show"],
  get_finder_show_statusbar: [],
  set_finder_show_statusbar: ["show"],
  get_finder_show_library_dir: [],
  set_finder_show_library_dir: ["show"],
  get_finder_show_file_extensions: [],
  set_finder_show_file_extensions: ["show"],
  get_finder_spotlight_external_disk: [],
  set_finder_spotlight_external_disk: ["disk", "enable"],
  get_finder_no_ds_store: [],
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
  get_network_firewall_state: [],
  set_network_firewall_state: ["enable"],
  get_network_ssh_state: [],
  set_network_ssh_state: ["enable"],
  get_network_screen_sharing_state: [],
  set_network_screen_sharing_state: ["enable"],
  get_network_airdrop_disabled: [],
  set_network_airdrop_disabled: ["disable"],
  // system settings - screenshot
  get_screenshot_format: [],
  set_screenshot_format: ["format"],
  get_screenshot_disable_shadow: [],
  set_screenshot_disable_shadow: ["disable"],
  get_screenshot_show_thumbnail: [],
  set_screenshot_show_thumbnail: ["show"],
  get_screenshot_save_location: [],
  set_screenshot_save_location: ["path"],
  // system settings - privacy
  get_tcc_permissions: ["service"],
  // system settings - maintenance
  rebuild_icon_cache: [],
  flush_dns_cache: [],
  rebuild_spotlight_index: [],
  reset_launch_services: [],
  flush_font_cache: [],
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
  // system settings - semantic pane registry
  open_settings_pane: ["pane"],
  open_battery_settings: [],
  open_control_center_settings: [],
  open_desktop_settings: [],
  open_keyboard_settings: [],
  open_localization_settings: [],
  open_lock_screen_settings: [],
  open_login_items_settings: [],
  open_network_settings: [],
  open_privacy_security_settings: [],
  set_default_browser: ["bundleId"],
  // system settings - privacy
  reset_tcc_permission: ["service", "bundleId"],
  // system settings - gatekeeper
  get_gatekeeper_state: [],
  // system settings - login items
  get_login_items: [],
  add_login_item: ["path"],
  remove_login_item: ["name"],
  get_launch_agents: [],
  get_launch_daemons: [],
  // system settings - dev tools
  json_format: ["input", "indent"],
  base64_encode: ["input"],
  base64_decode: ["input"],
  generate_uuid: [],
  calculate_hash: ["input", "algorithm"],
  timestamp_convert: ["ts", "format"],
  // system settings - network diagnostics
  ping_host: ["host", "count"],
  dns_lookup: ["domain", "recordType"],
  port_check: ["host", "port"],
  traceroute_host: ["host"],
  get_local_ip: [],
  get_wifi_info: [],
  // system settings - system toggles
  get_dark_mode_state: [],
  set_dark_mode_state: ["enabled"],
  get_autohide_dock_state: [],
  set_autohide_dock_state: ["enabled"],
  get_autohide_menu_bar_state: [],
  set_autohide_menu_bar_state: ["mode"],
  get_dock_show_recents_state: [],
  set_dock_show_recents_state: ["enabled"],
  get_hide_desktop_icons_state: [],
  set_hide_desktop_icons_state: ["hide"],
  get_low_power_mode_state: [],
  set_low_power_mode_state: ["mode"],
  get_screen_saver_state: [],
  set_screen_saver_state: ["enabled"],
  // file operations
  write_text_file: ["path", "content"],
  read_text_file: ["path"],
  ensure_dir: ["path"],
  file_exists: ["path"],
  temp_dir: [],
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

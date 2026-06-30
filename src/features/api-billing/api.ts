/**
 * api-billing IPC bindings / 中转站账号通信桥: thin invoke wrappers; 只封装命令调用.
 */
import { invokeTauriCommand } from "@/lib/tauri/invoke";
import type {
  AccountSessionStatus,
  AuthProfile,
  ExclusivityMode,
  LoginDetectionConfig,
  ProbeStrategy,
  RelayDataExportResult,
  RelayDataImportResult,
  RelayExportMode,
  RelayStation,
  StationAccount,
  LoginMethod,
} from "@/lib/tauri/types/api-billing";

export type {
  AccountSessionStatus,
  AccountType,
  AuthProfile,
  ExclusivityMode,
  LoginDetectionConfig,
  LoginDetectionMode,
  LoginDetectionPresence,
  LoginDetectionRule,
  ProbeStrategy,
  RelayDataExportResult,
  RelayDataImportResult,
  RelayExportMode,
  RelayStation,
  StationAccount,
  LoginMethod,
} from "@/lib/tauri/types/api-billing";
export { DEFAULT_LOGIN_DETECTION } from "@/lib/tauri/types/api-billing";

export function listStations(): Promise<RelayStation[]> {
  return invokeTauriCommand("list_stations");
}

export function createStation(
  remark: string,
  website: string,
  loginDetection?: LoginDetectionConfig | null
): Promise<RelayStation> {
  return invokeTauriCommand("create_station", {
    remark,
    website,
    loginDetection: loginDetection ?? null,
  });
}

export function updateStation(
  id: string,
  patch: { remark?: string; website?: string; loginDetection?: LoginDetectionConfig | null }
): Promise<RelayStation> {
  return invokeTauriCommand("update_station", {
    id,
    remark: patch.remark ?? null,
    website: patch.website ?? null,
    loginDetection: "loginDetection" in patch ? patch.loginDetection ?? null : null,
  });
}

export function deleteStation(id: string): Promise<void> {
  return invokeTauriCommand("delete_station", { id });
}

export function listAllAccounts(): Promise<StationAccount[]> {
  return invokeTauriCommand("list_all_accounts");
}

export function listAccounts(stationId: string): Promise<StationAccount[]> {
  return invokeTauriCommand("list_accounts", { stationId });
}

export function createAccount(
  stationId: string,
  username: string,
  password: string | null,
  notes: string,
  phone?: string | null,
  tgAccount?: string | null,
  linkedAccount?: string | null,
  inviteLink?: string | null,
  loginMethods?: LoginMethod[]
): Promise<StationAccount> {
  return invokeTauriCommand("create_account", {
    stationId,
    username,
    password,
    notes,
    phone: phone ?? null,
    tgAccount: tgAccount ?? null,
    linkedAccount: linkedAccount ?? null,
    inviteLink: inviteLink ?? null,
    loginMethods: loginMethods ?? [],
  });
}

export function updateAccount(
  id: string,
  patch: { 
    username?: string; 
    notes?: string; 
    phone?: string | null; 
    tgAccount?: string | null; 
    linkedAccount?: string | null;
    inviteLink?: string | null;
    loginMethods?: LoginMethod[];
  }
): Promise<StationAccount> {
  return invokeTauriCommand("update_account", {
    id,
    username: patch.username ?? null,
    notes: patch.notes ?? null,
    phone: "phone" in patch ? patch.phone : null,
    tgAccount: "tgAccount" in patch ? patch.tgAccount : null,
    linkedAccount: "linkedAccount" in patch ? patch.linkedAccount : null,
    inviteLink: "inviteLink" in patch ? patch.inviteLink : null,
    loginMethods: "loginMethods" in patch ? patch.loginMethods : undefined,
  });
}

export function deleteAccount(id: string): Promise<void> {
  return invokeTauriCommand("delete_account", { id });
}

export function revealPassword(accountId: string): Promise<string> {
  return invokeTauriCommand("reveal_password", { accountId });
}

export function setPassword(accountId: string, password: string): Promise<void> {
  return invokeTauriCommand("set_password", { accountId, password });
}

export function clearPassword(accountId: string): Promise<void> {
  return invokeTauriCommand("clear_password", { accountId });
}

export function copyPasswordToClipboard(accountId: string): Promise<void> {
  return invokeTauriCommand("copy_password_to_clipboard", { accountId });
}

export function openLoginWindow(accountId: string): Promise<void> {
  return invokeTauriCommand("open_login_window", { accountId });
}

export function markAccountLoggedIn(accountId: string): Promise<StationAccount> {
  return invokeTauriCommand("mark_account_logged_in", { accountId });
}

export function refreshAccount(accountId: string): Promise<StationAccount> {
  return invokeTauriCommand("refresh_account", { accountId });
}

export function refreshStation(stationId: string): Promise<StationAccount[]> {
  return invokeTauriCommand("refresh_station", { stationId });
}

export function refreshAll(): Promise<StationAccount[]> {
  return invokeTauriCommand("refresh_all");
}

export function exportRelayData(
  path: string,
  mode: RelayExportMode = "sanitized"
): Promise<RelayDataExportResult> {
  return invokeTauriCommand("export_relay_data", { path, mode });
}

export function importRelayData(path: string): Promise<RelayDataImportResult> {
  return invokeTauriCommand("import_relay_data", { path });
}

export function reorderStations(orderedIds: string[]): Promise<RelayStation[]> {
  return invokeTauriCommand("reorder_stations", { orderedIds });
}

export function reorderAccounts(
  stationId: string,
  orderedIds: string[]
): Promise<StationAccount[]> {
  return invokeTauriCommand("reorder_accounts", { stationId, orderedIds });
}

// ═══════════════════════════════════════════════
// Session Manager — 新增 API 绑定
// ═══════════════════════════════════════════════

export function captureAccountSession(accountId: string): Promise<AccountSessionStatus> {
  return invokeTauriCommand("capture_account_session", { accountId });
}

export function restoreAccountSession(accountId: string): Promise<AccountSessionStatus> {
  return invokeTauriCommand("restore_account_session", { accountId });
}

export function clearAccountSession(accountId: string): Promise<void> {
  return invokeTauriCommand("clear_account_session", { accountId });
}

export function detectStationAuthProfile(stationId: string): Promise<AuthProfile> {
  return invokeTauriCommand("detect_station_auth_profile", { stationId });
}

export function getStationAuthProfile(stationId: string): Promise<AuthProfile | null> {
  return invokeTauriCommand("get_station_auth_profile", { stationId });
}

export function setExclusivityMode(
  stationId: string,
  mode: ExclusivityMode
): Promise<RelayStation> {
  return invokeTauriCommand("set_exclusivity_mode", { stationId, mode });
}

/// Rotating 模式下切换活跃账号
export function switchActiveAccount(
  stationId: string,
  accountId: string
): Promise<StationAccount> {
  return invokeTauriCommand("switch_active_account", { stationId, accountId });
}

/// 手动覆盖探针策略
export function setProbeStrategy(
  stationId: string,
  strategy: ProbeStrategy
): Promise<RelayStation> {
  return invokeTauriCommand("set_probe_strategy", { stationId, strategy });
}

/// 重置探针策略为自动
export function resetProbeStrategy(stationId: string): Promise<RelayStation> {
  return invokeTauriCommand("reset_probe_strategy", { stationId });
}

// === Session Manager v1.5 ===

/// 创建一个临时账号(快速登录入口)。stationId 可选。
export function createEphemeralAccount(
  website: string,
  username: string,
  stationId?: string | null
): Promise<StationAccount> {
  return invokeTauriCommand("create_ephemeral_account", {
    website,
    username,
    stationId: stationId ?? null,
  });
}

/// 设置 Station 的 session TTL(小时)。0 = 永不过期。
export function setSessionTtl(
  stationId: string,
  ttlHours: number
): Promise<RelayStation> {
  return invokeTauriCommand("set_session_ttl", { stationId, ttlHours });
}

/// update_station 包装:支持更新 sessionTtlHours。
export function updateStationWithTtl(
  id: string,
  patch: {
    remark?: string;
    website?: string;
    loginDetection?: LoginDetectionConfig;
    sessionTtlHours?: number;
  }
): Promise<RelayStation> {
  return invokeTauriCommand("update_station", {
    id,
    remark: patch.remark ?? null,
    website: patch.website ?? null,
    loginDetection: patch.loginDetection ?? null,
    sessionTtlHours: patch.sessionTtlHours ?? null,
  });
}

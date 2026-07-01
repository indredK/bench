/**
 * account-manager IPC bindings / 中转站账号通信桥: thin invoke wrappers; 只封装命令调用.
 */
import { invokeTauriCommand } from "@/lib/tauri/invoke";
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
  ProbeStrategy,
  RelayDataExportResult,
  RelayDataImportResult,
  RelayExportMode,
  RelayStation,
  StationAccount,
  LoginMethod,
} from "@/lib/tauri/types/account-manager";

export type {
  AccountSessionStatus,
  AccountType,
  AuthProfile,
  AuthProxyMatch,
  AuthProxyRequest,
  AuthProxyResult,
  BrowserOpenResult,
  ExclusivityMode,
  ExternalApp,
  ExternalAppBinding,
  LoginDetectionConfig,
  LoginDetectionMode,
  LoginDetectionPresence,
  LoginDetectionRule,
  MatchConfidence,
  ProbeStrategy,
  RelayDataExportResult,
  RelayDataImportResult,
  RelayExportMode,
  RelayStation,
  StationAccount,
  LoginMethod,
} from "@/lib/tauri/types/account-manager";
export { DEFAULT_LOGIN_DETECTION } from "@/lib/tauri/types/account-manager";

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

/// 设置账号的外部登录代理开关
export function setAccountProxyEnabled(
  accountId: string,
  enabled: boolean
): Promise<StationAccount> {
  return invokeTauriCommand("set_account_proxy_enabled", { accountId, enabled });
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

// ═══════════════════════════════════════════════
// 外部登录代理 — Phase 1 API
// ═══════════════════════════════════════════════

/// 解析 bench-auth://authorize URL
export function parseAuthProxyUrl(rawUrl: string): Promise<AuthProxyRequest> {
  return invokeTauriCommand("parse_auth_proxy_url", { rawUrl });
}

/// 根据目标 URL 匹配可用的 Station
export function matchProxyTarget(target: string): Promise<AuthProxyMatch[]> {
  return invokeTauriCommand("match_proxy_target", { target });
}

/// 打开登录窗口（支持 return_url）
export function openLoginWindowWithReturn(
  accountId: string,
  returnUrl?: string | null
): Promise<void> {
  return invokeTauriCommand("open_login_window", {
    accountId,
    returnUrl: returnUrl ?? null,
  });
}

/// 构建外部登录代理的回调 URL
export function buildProxyReturnUrl(
  returnUrl: string,
  token: string,
  tokenType: string,
  state: string | null,
  stationId: string,
  accountId: string
): Promise<string> {
  return invokeTauriCommand("build_proxy_return_url", {
    returnUrl,
    token,
    tokenType,
    state,
    stationId,
    accountId,
  });
}

/// 接收外部 `bench-auth://authorize` 请求,返回匹配到的 Station + 账号列表。
/// 前端展示账号选择器;用户选定账号后再调 `proxyLogin` 启动登录。
export function handleAuthProxy(
  targetUrl: string,
  returnUrl: string,
  state?: string | null,
  siteHint?: string | null
): Promise<AuthProxyMatch[]> {
  return invokeTauriCommand("handle_auth_proxy", {
    targetUrl,
    returnUrl,
    state: state ?? null,
    siteHint: siteHint ?? null,
  });
}

/// 启动外部代理登录:打开登录窗口 → 注入凭证 → 返回占位 AuthProxyResult。
/// 真正的 token 由前端在用户完成登录后通过 `captureAccountSession`
/// + `buildProxyReturnUrl` 组装,再用 `openExternal` 回呼外部 App。
export function proxyLogin(
  accountId: string,
  targetUrl: string,
  returnUrl: string
): Promise<AuthProxyResult> {
  return invokeTauriCommand("proxy_login", { accountId, targetUrl, returnUrl });
}

/// 处理一次"用 bench 打开"的 URL（`bench-auth://` 或直接的 https authorize 链接）。
/// 返回归一化的 target / 回调地址 / host / 是否像登录链接 / 已匹配账号。
export function handleBrowserOpen(url: string): Promise<BrowserOpenResult> {
  return invokeTauriCommand("handle_browser_open", { url });
}

/// 在指定 host 下「使用新账号登录」:自动建站/分组 + 创建新账号 + 启动代理登录。
/// 返回新建的账号。
export function proxyLoginNewAccount(
  host: string,
  targetUrl: string,
  returnUrl: string,
  username?: string | null
): Promise<StationAccount> {
  return invokeTauriCommand("proxy_login_new_account", {
    host,
    targetUrl,
    returnUrl,
    username: username ?? null,
  });
}

/// 列出已注册的外部 App。
/// - `accountId` 提供时,只返回绑定到该账号的 App
/// - `stationId` 提供时(且 `accountId` 未提供),返回绑定到该 Station 下任意账号的 App
/// - 两者均未提供时,返回全部外部 App
export function listExternalApps(
  stationId?: string | null,
  accountId?: string | null
): Promise<ExternalApp[]> {
  return invokeTauriCommand("list_external_apps", {
    stationId: stationId ?? null,
    accountId: accountId ?? null,
  });
}

/// 注册外部 App。若相同 urlScheme 已存在,后端直接返回已有记录(去重)。
export function registerExternalApp(
  name: string,
  urlScheme: string,
  returnHosts: string[]
): Promise<ExternalApp> {
  return invokeTauriCommand("register_external_app", {
    name,
    urlScheme,
    returnHosts,
  });
}

/// 移除外部 App + 其所有绑定 + 账号上的引用
export function removeExternalApp(appId: string): Promise<void> {
  return invokeTauriCommand("remove_external_app", { appId });
}

/// 列出外部 App 与账号的绑定关系。`accountId` 提供时只返回该账号的绑定。
export function listExternalAppBindings(
  accountId?: string | null
): Promise<ExternalAppBinding[]> {
  return invokeTauriCommand("list_external_app_bindings", {
    accountId: accountId ?? null,
  });
}

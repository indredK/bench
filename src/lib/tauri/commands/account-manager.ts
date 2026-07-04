/**
 * IPC Commands / 通信命令: account-manager data bridge.
 */
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import type {
  AuthProfile,
  AuthProxyResult,
  BrowserOpenResult,
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
} from "@/lib/tauri/types/account-manager"

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
  LoginMethod,
  MatchConfidence,
  NetworkProxyConfig,
  NetworkProxyType,
  ProbeStrategy,
  RelayDataExportResult,
  RelayDataImportResult,
  RelayExportMode,
  RelayStation,
  StationAccount,
} from "@/lib/tauri/types/account-manager"
export { DEFAULT_LOGIN_DETECTION } from "@/lib/tauri/types/account-manager"

export function listStations(): Promise<RelayStation[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.listStations)
}

export function createStation(
  remark: string,
  website: string,
  loginDetection?: LoginDetectionConfig | null,
): Promise<RelayStation> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.createStation, {
    remark,
    website,
    loginDetection: loginDetection ?? null,
  })
}

export function updateStation(
  id: string,
  patch: { remark?: string; website?: string; loginDetection?: LoginDetectionConfig | null },
): Promise<RelayStation> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.updateStation, {
    id,
    remark: patch.remark ?? null,
    website: patch.website ?? null,
    loginDetection: "loginDetection" in patch ? (patch.loginDetection ?? null) : null,
  })
}

export function deleteStation(id: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.deleteStation, { id })
}

export function listAllAccounts(): Promise<StationAccount[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.listAllAccounts)
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
  loginMethods?: LoginMethod[],
): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.createAccount, {
    stationId,
    username,
    password,
    notes,
    phone: phone ?? null,
    tgAccount: tgAccount ?? null,
    linkedAccount: linkedAccount ?? null,
    inviteLink: inviteLink ?? null,
    loginMethods: loginMethods ?? [],
  })
}

export function updateAccount(
  id: string,
  patch: {
    username?: string
    notes?: string
    phone?: string | null
    tgAccount?: string | null
    linkedAccount?: string | null
    inviteLink?: string | null
    loginMethods?: LoginMethod[]
  },
): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.updateAccount, {
    id,
    username: patch.username ?? null,
    notes: patch.notes ?? null,
    phone: "phone" in patch ? patch.phone : null,
    tgAccount: "tgAccount" in patch ? patch.tgAccount : null,
    linkedAccount: "linkedAccount" in patch ? patch.linkedAccount : null,
    inviteLink: "inviteLink" in patch ? patch.inviteLink : null,
    loginMethods: "loginMethods" in patch ? patch.loginMethods : undefined,
  })
}

export function deleteAccount(id: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.deleteAccount, { id })
}

export function revealPassword(accountId: string): Promise<string> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.revealPassword, { accountId })
}

export function setPassword(accountId: string, password: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.setPassword, { accountId, password })
}

export function copyPasswordToClipboard(accountId: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.copyPasswordToClipboard, { accountId })
}

export function openLoginWindow(accountId: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.openLoginWindow, { accountId })
}

export function refreshAccount(accountId: string): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.refreshAccount, { accountId })
}

export function refreshStation(stationId: string): Promise<StationAccount[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.refreshStation, { stationId })
}

export function refreshAll(): Promise<StationAccount[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.refreshAll)
}

export function exportRelayData(
  path: string,
  mode: RelayExportMode = "sanitized",
): Promise<RelayDataExportResult> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.exportRelayData, { path, mode })
}

export function importRelayData(path: string): Promise<RelayDataImportResult> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.importRelayData, { path })
}

export function reorderStations(orderedIds: string[]): Promise<RelayStation[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.reorderStations, { orderedIds })
}

export function reorderAccounts(
  stationId: string,
  orderedIds: string[],
): Promise<StationAccount[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.reorderAccounts, {
    stationId,
    orderedIds,
  })
}

export function detectStationAuthProfile(
  stationId: string,
  accountId?: string,
): Promise<AuthProfile> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.detectStationAuthProfile, {
    stationId,
    accountId: accountId ?? null,
  })
}

/// 手动覆盖探针策略
export function setProbeStrategy(
  stationId: string,
  strategy: ProbeStrategy,
): Promise<RelayStation> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.setProbeStrategy, { stationId, strategy })
}

/// 重置探针策略为自动
export function resetProbeStrategy(stationId: string): Promise<RelayStation> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.resetProbeStrategy, { stationId })
}

// === Session Manager v1.5 ===

/// 创建一个临时账号(快速登录入口)。stationId 可选。
export function createEphemeralAccount(
  website: string,
  username: string,
  stationId?: string | null,
): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.createEphemeralAccount, {
    website,
    username,
    stationId: stationId ?? null,
  })
}

/// 设置 Station 的 session TTL(小时)。0 = 永不过期。
export function setSessionTtl(stationId: string, ttlHours: number): Promise<RelayStation> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.setSessionTtl, { stationId, ttlHours })
}

/// 设置 Station 的网络代理(HTTP / SOCKS5)。
/// `config = null` 清除代理(直连)。`password` 为明文(后端加密);null 清除已存密码。
/// 注意:前端传入的 `config.encryptedPassword` 会被后端忽略,以后端加密结果为准。
export function setStationNetworkProxy(
  stationId: string,
  config: NetworkProxyConfig | null,
  password: string | null,
): Promise<RelayStation> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.setStationNetworkProxy, {
    stationId,
    config,
    password,
  })
}

/// 设置账号的外部登录代理开关
export function setAccountProxyEnabled(
  accountId: string,
  enabled: boolean,
): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.setAccountProxyEnabled, {
    accountId,
    enabled,
  })
}

/// 启动外部代理登录:打开登录窗口 → 注入凭证 → 返回占位 AuthProxyResult。
/// 真正的 token 由前端在用户完成登录后通过 `captureAccountSession`
/// + `buildProxyReturnUrl` 组装,再用 `openExternal` 回呼外部 App。
export function proxyLogin(
  accountId: string,
  targetUrl: string,
  returnUrl: string,
): Promise<AuthProxyResult> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.proxyLogin, {
    accountId,
    targetUrl,
    returnUrl,
  })
}

/// 处理一次"用 bench 打开"的 URL（`bench-auth://` 或直接的 https authorize 链接）。
/// 返回归一化的 target / 回调地址 / host / 是否像登录链接 / 已匹配账号。
export function handleBrowserOpen(url: string): Promise<BrowserOpenResult> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.handleBrowserOpen, { url })
}

/// 在指定 host 下「使用新账号登录」:自动建站/分组 + 创建新账号 + 启动代理登录。
/// 返回新建的账号。
export function proxyLoginNewAccount(
  host: string,
  targetUrl: string,
  returnUrl: string,
  username?: string | null,
): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.proxyLoginNewAccount, {
    host,
    targetUrl,
    returnUrl,
    username: username ?? null,
  })
}

/// 列出已注册的外部 App。
/// - `accountId` 提供时,只返回绑定到该账号的 App
/// - `stationId` 提供时(且 `accountId` 未提供),返回绑定到该 Station 下任意账号的 App
/// - 两者均未提供时,返回全部外部 App
export function listExternalApps(
  stationId?: string | null,
  accountId?: string | null,
): Promise<ExternalApp[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.listExternalApps, {
    stationId: stationId ?? null,
    accountId: accountId ?? null,
  })
}

/// 移除外部 App + 其所有绑定 + 账号上的引用
export function removeExternalApp(appId: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.removeExternalApp, { appId })
}

/// 列出外部 App 与账号的绑定关系。`accountId` 提供时只返回该账号的绑定。
export function listExternalAppBindings(accountId?: string | null): Promise<ExternalAppBinding[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.listExternalAppBindings, {
    accountId: accountId ?? null,
  })
}

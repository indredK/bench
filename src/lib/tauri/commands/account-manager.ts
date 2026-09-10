/**
 * IPC Commands / 通信命令: account-manager data bridge.
 */
import { invokeTauriCommand } from "@/lib/tauri/invoke"
import { TAURI_COMMANDS } from "@/lib/tauri/contracts"
import type {
  AccountLogsResponse,
  AccountManagerCapabilities,
  AuthProfile,
  AuthProxyDrainResult,
  AuthProxyInboxStatus,
  AuthProxyResult,
  BrowserCaptureOutcome,
  BrowserOpenOutcome,
  BrowserOpenResult,
  BrowserOptionDto,
  BrowserProbeOutcome,
  BrowserStatusOutcome,
  DeletionReport,
  ExternalApp,
  ExternalAppBinding,
  LoginDetectionConfig,
  LoginFingerprintCaptureResult,
  LoginFingerprintDetail,
  LoginMethod,
  LoginRulesOverview,
  LoginRulesUpdateReport,
  LoginRulesUpdateScope,
  NetworkProxyConfig,
  PasswordAction,
  ProbeStrategy,
  RefreshSchedule,
  RelayDataExportResult,
  RelayDataImportResult,
  RefreshReport,
  RelayStation,
  StationAccount,
  StationUrlMatch,
} from "@/lib/tauri/types/account-manager"

export type {
  AccountManagerCapabilities,
  AccountManagerCapability,
  AccountLogEntry,
  AccountLogKind,
  AccountLogLevel,
  AccountLogsResponse,
  AccountSessionStatus,
  AccountType,
  AuthProfile,
  AuthProxyMatch,
  AuthProxyRequest,
  AuthProxyResult,
  BrowserCaptureOutcome,
  BrowserCaptureOutcomeKind,
  BrowserOpenOutcome,
  BrowserOpenResult,
  BrowserOptionDto,
  BrowserProbeOutcome,
  BrowserStatusOutcome,
  DeletionReport,
  ExclusivityMode,
  ExternalApp,
  ExternalAppBinding,
  LoginDetectionConfig,
  LoginDetectionMode,
  LoginDetectionPresence,
  LoginDetectionRule,
  LoginFingerprintCaptureResult,
  LoginFingerprintDetail,
  LoginFingerprintSummary,
  LoginMethod,
  LoginRulesOverview,
  LoginRuleRemoteEntry,
  LoginRuleSource,
  LoginRuleSummary,
  LoginRulesRemoteStatus,
  LoginRulesUpdateReport,
  LoginRulesUpdateScope,
  MatchConfidence,
  NetworkProxyConfig,
  NetworkProxyType,
  PasswordAction,
  ProbeStrategy,
  RefreshSchedule,
  RefreshScheduleMode,
  RelayDataExportResult,
  RelayDataImportResult,
  RelayExportMode,
  RelayStation,
  SessionOrigin,
  StationAccount,
  StationUrlMatch,
  StationUrlMatchConfidence,
} from "@/lib/tauri/types/account-manager"
export { DEFAULT_LOGIN_DETECTION } from "@/lib/tauri/types/account-manager"

export function getAccountManagerCapabilities(): Promise<AccountManagerCapabilities> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.getCapabilities)
}

/** 初始化失败后的重试入口：后端仅在 init_error 置位时重跑 init_state（会重新弹出钥匙串授权）。 */
export function retryAccountManagerInit(): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.retryInit)
}

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

export function deleteStation(id: string): Promise<DeletionReport> {
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

export function deleteAccount(id: string): Promise<DeletionReport> {
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

/**
 * 导出账号完整快照（pretty JSON 字符串）：账号信息 + 明文密码 + session
 * （cookies 明文、origins 解密明文）+ 登录指纹 + 站点信息。**明文凭证出口**，
 * 调用方负责去向（剪贴板 / JSON 文件）与用户警示。
 */
export function exportAccountSnapshot(accountId: string): Promise<string> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.exportAccountSnapshot, { accountId })
}

export function openLoginWindow(accountId: string, url?: string): Promise<void> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.openLoginWindow, {
    accountId,
    url: url ?? null,
  })
}

export function refreshAccount(accountId: string): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.refreshAccount, { accountId })
}

export function refreshStation(stationId: string): Promise<RefreshReport> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.refreshStation, { stationId })
}

export function refreshAll(): Promise<RefreshReport> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.refreshAll)
}

export function exportRelayData(path: string): Promise<RelayDataExportResult> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.exportRelayData, {
    path,
    mode: "sanitized",
  })
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
/// `config = null` 清除代理(直连)。密码变更使用 keep/set/clear 窄动作。
/// 注意:前端传入的 `config.encryptedPassword` 会被后端忽略,以后端加密结果为准。
export function setStationNetworkProxy(
  stationId: string,
  config: NetworkProxyConfig | null,
  passwordAction: PasswordAction,
): Promise<RelayStation> {
  const sanitized = config ? { ...config, encryptedPassword: null } : null
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.setStationNetworkProxy, {
    stationId,
    config: sanitized,
    passwordAction,
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

/// Session Keeper: 设置/更新/关闭账号的静默刷新计划(null = 清除)。
export function setAccountRefreshSchedule(
  accountId: string,
  schedule: RefreshSchedule | null,
): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.setAccountRefreshSchedule, {
    accountId,
    schedule,
  })
}

/// Session Keeper: 读取账号日志(倒序)+ 当前计划与下次执行时间。
export function listAccountLogs(accountId: string): Promise<AccountLogsResponse> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.listAccountLogs, { accountId })
}

/// 按 URL host 匹配站点(快速登录粘贴 URL → 自动识别分组)。
export function matchStationsByUrl(url: string): Promise<StationUrlMatch[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.matchStationsByUrl, { url })
}

/// F2 — 采集站点登录指纹(特征名不出后端),顺带刷新 authProfile。
export function captureLoginFingerprint(
  stationId: string,
  accountId: string,
): Promise<LoginFingerprintCaptureResult> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.captureLoginFingerprint, {
    stationId,
    accountId,
  })
}

/// F2 — 用户确认:将该账号当前状态识别为站点的活跃(已登录)状态。
export function confirmLoginFingerprint(
  stationId: string,
  accountId: string,
): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.confirmLoginFingerprint, {
    stationId,
    accountId,
  })
}

/// F2 — 读取站点登录指纹明细(弹窗二级视图;值不出后端,站点无指纹时返回 null)。
export function getLoginFingerprintDetail(
  stationId: string,
): Promise<LoginFingerprintDetail | null> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.getLoginFingerprintDetail, { stationId })
}

/** 「更新登录逻辑」弹窗:当前生效规则详情(generic + 当前站点)+ 远程可更新状态。 */
export function getLoginRulesOverview(website: string): Promise<LoginRulesOverview> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.getLoginRulesOverview, { website })
}

/** 按范围拉取远程登录规则并写入缓存:all | generic | site。 */
export function updateLoginRules(
  scope: LoginRulesUpdateScope,
  website?: string | null,
): Promise<LoginRulesUpdateReport> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.updateLoginRules, {
    scope,
    website: website ?? null,
  })
}

/// 启动外部代理登录:打开登录窗口 → 注入凭证 → 返回占位 AuthProxyResult。
/// 真正的 token 由前端在用户完成登录后通过 `captureAccountSession`
/// + `buildProxyReturnUrl` 组装,再用 `openExternal` 回呼外部 App。
export function proxyLogin(accountId: string, ticketId: string): Promise<AuthProxyResult> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.proxyLogin, {
    accountId,
    ticketId,
  })
}

/// 处理一次"用 bench 打开"的 URL（`bench-auth://` 或直接的 https authorize 链接）。
/// 返回归一化的 target / 回调地址 / host / 是否像登录链接 / 已匹配账号。
export function handleBrowserOpen(url: string): Promise<BrowserOpenResult> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.handleBrowserOpen, { url })
}

export function getAuthProxyInboxStatus(): Promise<AuthProxyInboxStatus> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.getAuthProxyInboxStatus)
}

export function drainAuthProxyRequest(): Promise<AuthProxyDrainResult> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.drainAuthProxyRequest)
}

/// 在指定 host 下「使用新账号登录」:自动建站/分组 + 创建新账号 + 启动代理登录。
/// 返回新建的账号。
export function proxyLoginNewAccount(
  ticketId: string,
  username?: string | null,
): Promise<StationAccount> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.proxyLoginNewAccount, {
    ticketId,
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

// ═══════════════════════════════════════════════
// 互通 I1/I2 — 账号 ↔ 浏览器会话互操作
// ═══════════════════════════════════════════════

/**
 * 列出本机可用的受支持浏览器（Chromium 系：Chrome / Edge / Brave / Chromium）。
 * 返回项只含 id 与展示名，不含本机路径。
 */
export function browserSessionBrowsers(): Promise<BrowserOptionDto[]> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.browserSessionBrowsers)
}

/**
 * 打开（或复用）该账号的托管浏览器实例。
 *
 * - `injectSession = true`：注入账号会话后导航到站点（以该账号身份浏览）。
 * - `injectSession = false`：只打开站点，供用户在真实浏览器里完成扫码 / 2FA / SSO。
 * - `resetProfile = true`：先关闭实例并清空 profile，保证干净起点。
 *
 * 站点地址由后端从账号所属 RelayStation 读取，前端**不传 URL**。
 */
export function browserSessionOpen(
  accountId: string,
  opts?: { browserId?: string | null; injectSession?: boolean; resetProfile?: boolean },
): Promise<BrowserOpenOutcome> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.browserSessionOpen, {
    accountId,
    browserId: opts?.browserId ?? null,
    injectSession: opts?.injectSession ?? true,
    resetProfile: opts?.resetProfile ?? false,
  })
}

/// 查询该账号的浏览器实例状态（是否运行、浏览器 id、调试端口）。
export function browserSessionStatus(accountId: string): Promise<BrowserStatusOutcome> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.browserSessionStatus, { accountId })
}

/// 关闭该账号的浏览器实例。返回是否确有实例被关闭。
export function browserSessionClose(accountId: string): Promise<boolean> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.browserSessionClose, { accountId })
}

/**
 * 从托管浏览器回采会话并写入 Bench（入向）。
 *
 * `force = false` 时若 Bench 已有**不早于**本次的会话，返回 `outcome = "conflict"`
 * 且不写入；前端应据 `existingCapturedAtTs` / `existingOrigin` 二次确认后再以
 * `force = true` 重试，绝不静默覆盖更新鲜的会话。
 */
export function browserSessionCapture(
  accountId: string,
  force = false,
): Promise<BrowserCaptureOutcome> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.browserSessionCapture, {
    accountId,
    force,
  })
}

/// 只读预检：判断浏览器中是否已存在该站点的登录态（不写入任何数据）。
export function browserSessionProbe(accountId: string): Promise<BrowserProbeOutcome> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.browserSessionProbe, { accountId })
}

/// 清空该账号的浏览器 profile（先关闭实例）。用于「重新登录」场景。
export function browserSessionClearProfile(accountId: string): Promise<boolean> {
  return invokeTauriCommand(TAURI_COMMANDS.accountManager.browserSessionClearProfile, { accountId })
}

/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export type AccountSessionStatus =
  "ready" | "loginRequired" | "expired" | "fetchFailed" | "inactive"

export type AccountType = "persistent" | "ephemeral"

export type CapabilityStatus = "supported" | "partial" | "unsupported" | "failed"

export interface AccountManagerCapability {
  status: CapabilityStatus
  reasonCode?: string | null
}

export interface AccountManagerCapabilities {
  platform: string
  credentialStore: AccountManagerCapability
  isolatedWebview: AccountManagerCapability
  cookieSession: AccountManagerCapability
  webStorage: AccountManagerCapability
  indexedDb: AccountManagerCapability
  networkProxy: AccountManagerCapability
  deepLink: AccountManagerCapability
  /** 互通 I1：把账号会话注入 Bench 托管的浏览器实例（出向）。 */
  browserSessionOpen: AccountManagerCapability
  /** 互通 I2：从 Bench 托管的浏览器 profile 回采会话（入向）。 */
  browserSessionCapture: AccountManagerCapability
  /**
   * 互通 I3/I5：经浏览器扩展读写**用户日常浏览器**的会话。
   *
   * 不依赖 Bench 启动浏览器，故不受「本机是否装有 Chromium 系浏览器」影响；
   * 「扩展是否已装」属运行态信息，见 `browserExtStatus.bridgeReady`。
   */
  browserSessionExtension: AccountManagerCapability
}

export type ExclusivityMode = "coexisting" | "exclusive" | "rotating"

export type ProbeStrategy = "httpFirst" | "httpOnly" | "webviewOnly" | "hybrid"

export type TokenStorage =
  "cookie" | "localStorage" | "sessionStorage" | "indexedDB" | "multiple" | "none"

export type AuthType =
  "sessionCookie" | "bearerOAuth" | "saml" | "openIdConnect" | "webSocket" | "unknown"

export type FingerprintingLevel = "none" | "basic" | "strict"

export interface CsrfExtraction {
  source: string
  name: string
  headerName: string
}

export interface AuthProfile {
  cookieBased: boolean
  tokenStorage: TokenStorage
  csrfProtection: boolean
  csrfExtraction?: CsrfExtraction | null
  authType: AuthType
  fingerprinting: FingerprintingLevel
  antiBot: boolean
  antiBotProvider?: string | null
  ssoProvider?: string | null
  probeStrategy: ProbeStrategy
  detectedAt: string
  confidence: number
}

export type LoginMethod = "emailCode" | "usernamePassword" | "linkedLink" | "phoneCode"

export type LoginDetectionMode = "presetLogin" | "presetLogout" | "custom"
export type LoginDetectionPresence = "present" | "absent"

export interface LoginDetectionRule {
  presence: LoginDetectionPresence
  text: string
}

export interface LoginDetectionConfig {
  mode: LoginDetectionMode
  loggedOutRule: LoginDetectionRule
  loggedInRule: LoginDetectionRule
}

export const DEFAULT_LOGIN_DETECTION: LoginDetectionConfig = {
  mode: "presetLogout",
  loggedOutRule: { presence: "present", text: "" },
  loggedInRule: { presence: "present", text: "" },
}

export interface RelayStation {
  id: string
  remark: string
  website: string
  createdAt: string
  loginDetection: LoginDetectionConfig
  // Session Manager 新增字段（后端 serde(default)，旧数据可能缺失，故可选）
  exclusivityMode?: ExclusivityMode
  authProfile?: AuthProfile | null
  probeFailureCount?: number
  /** F.6.2 — session 有效期(小时)。0 = 永不过期。默认 720。 */
  sessionTtlHours?: number
  /** v1.18 — per-station 网络代理(HTTP / SOCKS5)。None = 直连。 */
  networkProxy?: NetworkProxyConfig | null
  /** F2 — 登录态指纹摘要:采样时间与特征计数(前端只读摘要,无特征名)。 */
  loginFingerprint?: {
    sampledAt: string
    sampledByAccount: string
    cookieCount: number
    storageKeyCount: number
  } | null
}

/** 网络代理类型:HTTP 或 SOCKS5。 */
export type NetworkProxyType = "http" | "socks5"

/**
 * per-station 网络代理配置。
 * `encryptedPassword` 为 opaque 字段:前端仅用 `!= null` 判定是否已配置密码,
 * 不解密明文(明文由 `setStationNetworkProxy` 的 `password` 参数传入,后端加密)。
 */
export interface NetworkProxyConfig {
  proxyType: NetworkProxyType
  host: string
  port: number
  username?: string | null
  /** opaque — 后端加密返回,前端不解密。 */
  encryptedPassword?: unknown | null
}

export type PasswordAction =
  { action: "keep" } | { action: "set"; password: string } | { action: "clear" }

export interface StationAccount {
  id: string
  stationId: string
  username: string
  notes: string
  phone: string | null
  tgAccount: string | null
  linkedAccount: string | null
  inviteLink: string | null
  loginMethods: LoginMethod[]
  status: AccountSessionStatus
  lastLoginAt: string | null
  lastRefreshedAt: string | null
  createdAt: string
  hasPassword: boolean
  // Session Manager 新增字段（后端 serde(default)，旧数据可能缺失，故可选）
  accountType?: AccountType
  website?: string | null
  session?: unknown | null
  exclusivityGroup?: string | null
  proxyEnabled?: boolean
  // Session Keeper(会话保活)新增字段
  refreshSchedule?: RefreshSchedule | null
  nextRefreshAtTs?: number | null
  firstLoginAt?: string | null
  /** F2/D1 — 当前 status 的判定来源:仅指纹 L0 短路时为 "fingerprintMissing",其余 null。 */
  statusReason?: string | null
  /** 互通 I0 — 当前 session 的采集来源端点(旧数据缺失,故可选)。 */
  sessionOrigin?: SessionOrigin | null
  /** 互通 I0 — 来源端点补充标识(浏览器 id 等),不含凭据。 */
  originDetail?: string | null
}

// ═══════════════════════════════════════════════
// Session Keeper — 会话保活计划 / 账号日志
// ═══════════════════════════════════════════════

/** 静默刷新计划模式:每隔 N 小时,或每天固定时刻(本地时区)。 */
export type RefreshScheduleMode =
  { type: "interval"; hours: number } | { type: "daily"; minuteOfDay: number }

/** 每账号的会话保活计划。enabled=false 表示保留配置但暂停调度。 */
export interface RefreshSchedule {
  enabled: boolean
  mode: RefreshScheduleMode
}

/** 账号日志事件类型。 */
export type AccountLogKind =
  | "login"
  | "manualRefresh"
  | "autoRefresh"
  | "scheduleChanged"
  | "statusChanged"
  | "browserInterop"
  | "lifecycle"
  | "config"
  | "error"

/** 账号日志级别。 */
export type AccountLogLevel = "info" | "success" | "warn" | "error"

/** 单条账号日志。detail 仅含枚举字符串/数值,无敏感信息。 */
export interface AccountLogEntry {
  id: string
  /** 本地时间标签("YYYY-MM-DD HH:mm"),供直接展示。 */
  at: string
  /** UTC Unix 秒,供排序与格式化。 */
  atTs: number
  kind: AccountLogKind
  level: AccountLogLevel
  detail?: Record<string, unknown> | null
}

/** listAccountLogs 返回:日志倒序列表 + 当前计划与下次执行时间。 */
export interface AccountLogsResponse {
  entries: AccountLogEntry[]
  schedule: RefreshSchedule | null
  nextRefreshAtTs: number | null
}

/** 快速登录 URL → 站点匹配置信度:精确 host 或同一可注册域。 */
export type StationUrlMatchConfidence = "exact" | "registrableDomain"

/** 登录指纹采集结果摘要(F2)。前端只展示计数,不接收特征名列表(键名不出后端)。 */
export interface LoginFingerprintSummary {
  cookieCount: number
  storageKeyCount: number
  sampledAt: string
}

/** 指纹明细 — 单条 cookie 特征(仅形态信息,值永不出后端)。 */
export interface FingerprintCookieFeature {
  name: string
  domain: string
  path: string
  httpOnly: boolean
  valueLen: number
}

/** 指纹明细 — 单条 storage 键特征(仅键名与值长度)。 */
export interface FingerprintStorageKeyFeature {
  key: string
  valueLen: number
}

/** 指纹确认弹窗二级明细 — 站点指纹完整特征列表(只读,值不出后端)。 */
export interface LoginFingerprintDetail {
  sampledAt: string
  sampledByAccount: string
  cookies: FingerprintCookieFeature[]
  storageKeys: FingerprintStorageKeyFeature[]
}

/** F2 — 指纹采集返回:特征摘要 + 顺带刷新的 authProfile(一次采样两份画像)。 */
export interface LoginFingerprintCaptureResult {
  summary: LoginFingerprintSummary
  profile: AuthProfile
}

/** matchStationsByUrl 单条匹配结果。 */
export interface StationUrlMatch {
  stationId: string
  remark: string
  website: string
  accountCount: number
  confidence: StationUrlMatchConfidence
}

/**
 * v2.0 per-origin 存储（参考 Playwright storageState）。
 * 每个 origin 独立的 localStorage + sessionStorage 加密快照。
 */
export interface OriginStorage {
  origin: string
  localStorage?: unknown | null
  sessionStorage?: unknown | null
  indexedDb?: unknown | null
}

export interface RelayDataExportResult {
  stationCount: number
  accountCount: number
  mode: RelayExportMode
}

export interface RelayDataImportResult {
  stationCount: number
  accountCount: number
  stations: RelayStation[]
  accounts: StationAccount[]
}

export type DeletionStatus = "complete" | "partial"
export type DeletionResourceKind = "webviewData" | "metadata"
export type DeletionResourceStatus = "succeeded" | "failed"

export interface DeletionResourceResult {
  resource: DeletionResourceKind
  accountId?: string | null
  status: DeletionResourceStatus
  errorCode?: AccountManagerErrorCode | null
}

export interface DeletionReport {
  targetId: string
  status: DeletionStatus
  metadataDeleted: boolean
  removedAccountCount: number
  resources: DeletionResourceResult[]
}

export interface RefreshFailure {
  accountId: string
  error: AccountManagerError
}

export interface RefreshReport {
  total: number
  succeeded: StationAccount[]
  failed: RefreshFailure[]
}

export type AccountManagerErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "STORE_FAIL"
  | "KEYRING_UNAVAILABLE"
  | "CRYPTO_FAIL"
  | "CLIPBOARD_FAIL"

export interface AccountManagerError {
  code: AccountManagerErrorCode
  message: string
}

export type RelayExportMode = "sanitized" | "encryptedFull"

// ═══════════════════════════════════════════════
// 外部登录代理 — Phase 1/3 类型
// ═══════════════════════════════════════════════

export type MatchConfidence = "exact" | "sso" | "manual"

export interface AuthProxyMatch {
  stationId: string
  stationName: string
  website: string
  accounts: StationAccount[]
  confidence: MatchConfidence
}

export interface AuthProxyRequest {
  ticketId: string
  expiresAtTs: number
  target: string
  returnUrl: string
  state?: string | null
  site?: string | null
}

export interface AuthProxyResult {
  token: string
  tokenType: "cookie" | "bearer" | "code" | "sessionProof" | "unknown"
  state?: string | null
  stationId: string
  accountId: string
}

/// `handle_browser_open` 的统一返回:把一次"用 bench 打开 URL"
/// （bench-auth:// 或直接的 https authorize 链接）归一化为可处理的结构。
export interface BrowserOpenResult {
  ticketId: string
  expiresAtTs: number
  target: string
  returnUrl?: string | null
  host: string
  isAuthorize: boolean
  matches: AuthProxyMatch[]
}

export interface AuthProxyInboxStatus {
  pendingCount: number
  droppedCount: number
}

export interface AuthProxyDrainResult extends AuthProxyInboxStatus {
  request?: BrowserOpenResult | null
  rejectedCount: number
}

/// 已授权的外部 App（Phase 3）
export interface ExternalApp {
  id: string
  name: string
  urlScheme: string
  returnHosts: string[]
  firstUsedAt: string
  lastUsedAt: string
  useCount: number
}

/// 外部 App 与账号的绑定关系（Phase 3）
export interface ExternalAppBinding {
  id: string
  appId: string
  accountId: string
  firstUsedAt: string
  lastUsedAt: string
  useCount: number
}

// ═══════════════════════════════════════════════
// 登录规则包 — 更新登录逻辑弹窗
// ═══════════════════════════════════════════════

/** 规则来源："bundled"（随版本内置）| "remote"（远程市场缓存） */
export type LoginRuleSource = "bundled" | "remote"

/** 单条生效规则的概要（弹窗「当前使用的判断逻辑」详情） */
export interface LoginRuleSummary {
  id: string
  version: string
  title: string
  description: string
  source: LoginRuleSource
  /** 是否含服务端权威探针（强判据） */
  hasLoginCheck: boolean
  loginCheckUrl?: string | null
  loginCheckMethod?: string | null
  /** 文本弱证据（已登录侧） */
  loggedInTexts: string[]
  /** 文本弱证据（未登录侧） */
  loggedOutTexts: string[]
}

/** 远程索引中某条规则相对本地的可更新状态 */
export interface LoginRuleRemoteEntry {
  id: string
  version: string
  /** 远程版本 > 本地生效版本（可升级；本地缺失视为可新装） */
  updatable: boolean
}

/** 远程检查结果（null = 检查失败或无远程源，按钮禁用） */
export interface LoginRulesRemoteStatus {
  /** 本次检查时间（ISO 8601 UTC） */
  checkedAt: string
  /** 远程索引构建时间（rules.json updatedAt，即规则的「更新时间」） */
  indexUpdatedAt?: string | null
  generic: LoginRuleRemoteEntry | null
  site: LoginRuleRemoteEntry | null
  genericUpdatable: boolean
  siteUpdatable: boolean
}

/** get_login_rules_overview 响应 */
export interface LoginRulesOverview {
  /** 当前生效的 generic 兜底规则（恒存在，bundled 保底） */
  generic: LoginRuleSummary | null
  /** 当前站点命中的特殊规则（无则 null，判定走 generic） */
  site: LoginRuleSummary | null
  remote: LoginRulesRemoteStatus | null
  remoteError?: string | null
  /** 缓存最近一次成功拉取时间（unix 秒） */
  lastFetchedAt?: number | null
}

/** 更新范围：all（全部）| generic（仅兜底）| site（仅当前站点） */
export type LoginRulesUpdateScope = "all" | "generic" | "site"

/** update_login_rules 结果 */
export interface LoginRulesUpdateReport {
  updated: string[]
  /** 因「已最新/防降级」跳过的规则 id */
  skipped: string[]
  indexUpdatedAt?: string | null
}

// ═══════════════════════════════════════════════
// 互通 I0/I1/I2 — 账号 ↔ 浏览器会话互操作
// ═══════════════════════════════════════════════

/**
 * 会话采集来源端点（后端稳定字符串，**非本地化**；展示文案由前端 i18n 映射）。
 * 用于冲突弹窗里向用户交代「Bench 里这条会话是哪来的、比浏览器里的新还是旧」。
 */
export type SessionOrigin =
  | "unknown"
  | "webviewLogin"
  | "webviewKeeper"
  | "authProxy"
  | "browserCdp"
  | "browserExtension"
  | "import"

/** 可用的受支持浏览器（不含本机路径，故可安全下发给前端）。 */
export interface BrowserOptionDto {
  id: string
  name: string
}

/** browser_session_open 结果。 */
export interface BrowserOpenOutcome {
  browserId: string
  /** 复用已在运行的实例（未重新拉起进程）。 */
  reusedInstance: boolean
  injectedCookies: number
  /** 因 Cookie-Partition 隔离而跳过注入的条数。 */
  skippedPartitioned: number
  /** 浏览器拒绝写入的条数（属性不合法，如 sameSite=None 且非 secure）。 */
  rejectedCookies: number
  /**
   * 本次是否**真的**把账号会话写进了该实例。
   * 登录模式（injectSession=false）为 false；注入模式下若 Bench 没有该账号的已保存会话，
   * 同样为 false —— **不要**把这种情况当成成功。
   */
  sessionInjected: boolean
  /**
   * Bench 中是否存在该账号的已保存会话。
   * false 表示连 Bench 内置的账号登录档案里也没有登录态，应引导用户先在 Bench 里登录。
   */
  hasStoredSession: boolean
  /**
   * 本次注入所用的会话是否由 Bench 当场从其内置登录档案补采而来。
   * 补采成功时应报「已同步」，而不是「没有已保存的登录态」。
   */
  sessionRecovered: boolean
  /**
   * 补采未成功的原因：`notLoggedIn`(Bench 里没登录) / `noSessionData`(页面无响应或无可采数据)
   * / `syncFailed`(补采异常) / `conflict`(Bench 已有更新的会话)。
   */
  recoveryReason: string | null
  /** 实际恢复了 Web Storage / IndexedDB 的 origin 份数（0 = 该会话没有存储快照）。 */
  storageOrigins: number
}

/** browser_session_sync_daily 结果（同步到用户日常浏览器）。 */
export interface BrowserDailySyncOutcome {
  /** `ready`（Bench 侧会话就绪，已在目标浏览器打开站点）| `noSession`（无登录态可同步）。 */
  outcome: string
  browserId: string
  cookieCount: number
  storageOrigins: number
  /** 会话是否由 Bench 当场从其内置登录档案补采而来。 */
  sessionRecovered: boolean
  /** 补采失败原因：notLoggedIn / noSessionData / syncFailed / conflict。 */
  recoveryReason: string | null
}

/** browser_session_status 结果。 */
export interface BrowserStatusOutcome {
  running: boolean
  browserId?: string | null
  port?: number | null
}

/** browser_session_capture 的结果类别。 */
export type BrowserCaptureOutcomeKind = "saved" | "conflict" | "empty"

/** browser_session_capture 结果（只含计数/枚举，不含任何 cookie 或 storage 值）。 */
export interface BrowserCaptureOutcome {
  outcome: BrowserCaptureOutcomeKind
  cookieCount: number
  skippedPartitioned: number
  storageOrigins: number
  indexedDbStatus: string
  capturedAtTs: number
  /** outcome = "conflict" 时，Bench 侧已有会话的采集时间与来源。 */
  existingCapturedAtTs?: number | null
  existingOrigin?: SessionOrigin | null
  /** 写入后按站点探针复验的结果（无法复验时为 null）。 */
  verified?: boolean | null
}

/** browser_session_probe 结果：只读预检，不写入任何数据。 */
export interface BrowserProbeOutcome {
  running: boolean
  cookieCount: number
  /** 命中的站点指纹特征数（站点未采样指纹时为 null）。 */
  fingerprintHits?: number | null
  fingerprintTotal?: number | null
}

/** 站点维度回采面板的实时预览（只读，含 cookie 名称与计数，绝不含值）。 */
export interface BrowserSessionPreview {
  /** 站点实例是否在运行。 */
  running: boolean
  /** 命中站点可注册域的 cookie 条数。 */
  cookieCount: number
  /** 命中 cookie 的名称列表（不含值），供面板逐条展示。 */
  cookieNames: string[]
  /** 实际恢复了 Web Storage / IndexedDB 的 origin 份数。 */
  storageOrigins: number
  userAgent: string
  indexedDbStatus: string
  /** 命中的站点指纹特征数（站点未采样指纹时为 null）。 */
  fingerprintHits?: number | null
  fingerprintTotal?: number | null
}

/** browser_session_capture_station 的结果类别。 */
export type BrowserStationCaptureOutcomeKind = BrowserCaptureOutcomeKind

/** browser_session_capture_station 结果（只含计数/枚举/新建账号 id，不含任何值）。 */
export interface BrowserStationCaptureOutcome {
  outcome: BrowserStationCaptureOutcomeKind
  /** 实际写入的账号 id（新建或已有）。 */
  targetAccountId: string
  /** 仅当本次新建账号承接登录态时非空。 */
  createdAccountId?: string | null
  cookieCount: number
  skippedPartitioned: number
  storageOrigins: number
  indexedDbStatus: string
  capturedAtTs: number
  existingCapturedAtTs?: number | null
  existingOrigin?: SessionOrigin | null
  verified?: boolean | null
}

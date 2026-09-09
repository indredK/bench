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
  "login" | "manualRefresh" | "autoRefresh" | "scheduleChanged" | "statusChanged" | "error"

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
  /** 采样页是否存在登出元素(登录佐证,供确认弹窗展示)。 */
  hasLogoutEvidence: boolean
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

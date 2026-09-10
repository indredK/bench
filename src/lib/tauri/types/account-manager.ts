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

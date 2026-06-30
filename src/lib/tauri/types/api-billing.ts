/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export type AccountSessionStatus = "ready" | "loginRequired" | "expired" | "fetchFailed" | "inactive";

export type AccountType = "persistent" | "ephemeral";

export type ExclusivityMode = "coexisting" | "exclusive" | "rotating";

export type ProbeStrategy = "httpFirst" | "httpOnly" | "webviewOnly" | "hybrid";

export type TokenStorage = "cookie" | "localStorage" | "sessionStorage" | "indexedDB" | "multiple" | "none";

export type AuthType = "sessionCookie" | "bearerOAuth" | "saml" | "openIdConnect" | "webSocket" | "unknown";

export type FingerprintingLevel = "none" | "basic" | "strict";

export interface CsrfExtraction {
  source: string;
  name: string;
  headerName: string;
}

export interface AuthProfile {
  cookieBased: boolean;
  tokenStorage: TokenStorage;
  csrfProtection: boolean;
  csrfExtraction?: CsrfExtraction | null;
  authType: AuthType;
  fingerprinting: FingerprintingLevel;
  antiBot: boolean;
  antiBotProvider?: string | null;
  ssoProvider?: string | null;
  probeStrategy: ProbeStrategy;
  detectedAt: string;
  confidence: number;
}

export type LoginMethod = "emailCode" | "usernamePassword" | "linkedLink" | "phoneCode";

export type LoginDetectionMode = "presetLogin" | "presetLogout" | "custom";
export type LoginDetectionPresence = "present" | "absent";

export interface LoginDetectionRule {
  presence: LoginDetectionPresence;
  text: string;
}

export interface LoginDetectionConfig {
  mode: LoginDetectionMode;
  loggedOutRule: LoginDetectionRule;
  loggedInRule: LoginDetectionRule;
}

export const DEFAULT_LOGIN_DETECTION: LoginDetectionConfig = {
  mode: "presetLogout",
  loggedOutRule: { presence: "present", text: "" },
  loggedInRule: { presence: "present", text: "" },
};

export interface RelayStation {
  id: string;
  remark: string;
  website: string;
  createdAt: string;
  loginDetection: LoginDetectionConfig;
  // Session Manager 新增字段（后端 serde(default)，旧数据可能缺失，故可选）
  exclusivityMode?: ExclusivityMode;
  authProfile?: AuthProfile | null;
  probeFailureCount?: number;
  /** F.6.2 — session 有效期(小时)。0 = 永不过期。默认 720。 */
  sessionTtlHours?: number;
}

export interface StationAccount {
  id: string;
  stationId: string;
  username: string;
  notes: string;
  phone: string | null;
  tgAccount: string | null;
  linkedAccount: string | null;
  inviteLink: string | null;
  loginMethods: LoginMethod[];
  status: AccountSessionStatus;
  lastLoginAt: string | null;
  lastRefreshedAt: string | null;
  createdAt: string;
  hasPassword: boolean;
  // Session Manager 新增字段（后端 serde(default)，旧数据可能缺失，故可选）
  accountType?: AccountType;
  website?: string | null;
  session?: unknown | null;
  exclusivityGroup?: string | null;
  proxyEnabled?: boolean;
}

/**
 * v2.0 per-origin 存储（参考 Playwright storageState）。
 * 每个 origin 独立的 localStorage + sessionStorage 加密快照。
 */
export interface OriginStorage {
  origin: string;
  localStorage?: unknown | null;
  sessionStorage?: unknown | null;
}

export interface RelayDataExportResult {
  stationCount: number;
  accountCount: number;
  mode: RelayExportMode;
}

export interface RelayDataImportResult {
  stationCount: number;
  accountCount: number;
  stations: RelayStation[];
  accounts: StationAccount[];
}

export type ApiBillingErrorCode =
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "STORE_FAIL"
  | "KEYRING_UNAVAILABLE"
  | "CRYPTO_FAIL"
  | "CLIPBOARD_FAIL";

export interface ApiBillingError {
  code: ApiBillingErrorCode;
  message: string;
}

export type RelayExportMode = "sanitized" | "encryptedFull";

// ═══════════════════════════════════════════════
// 外部登录代理 — Phase 1/3 类型
// ═══════════════════════════════════════════════

export type MatchConfidence = "exact" | "sso" | "manual";

export interface AuthProxyMatch {
  stationId: string;
  stationName: string;
  website: string;
  accounts: StationAccount[];
  confidence: MatchConfidence;
}

export interface AuthProxyRequest {
  target: string;
  returnUrl: string;
  state?: string | null;
  site?: string | null;
}

export interface AuthProxyResult {
  token: string;
  tokenType: "cookie" | "bearer" | "code" | "sessionProof" | "unknown";
  state?: string | null;
  stationId: string;
  accountId: string;
}

/// `handle_browser_open` 的统一返回:把一次"用 bench 打开 URL"
/// （bench-auth:// 或直接的 https authorize 链接）归一化为可处理的结构。
export interface BrowserOpenResult {
  target: string;
  returnUrl?: string | null;
  host: string;
  isAuthorize: boolean;
  matches: AuthProxyMatch[];
}

/// 已授权的外部 App（Phase 3）
export interface ExternalApp {
  id: string;
  name: string;
  urlScheme: string;
  returnHosts: string[];
  firstUsedAt: string;
  lastUsedAt: string;
  useCount: number;
}

/// 外部 App 与账号的绑定关系（Phase 3）
export interface ExternalAppBinding {
  id: string;
  appId: string;
  accountId: string;
  firstUsedAt: string;
  lastUsedAt: string;
  useCount: number;
}

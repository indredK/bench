/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export type AccountSessionStatus = "ready" | "loginRequired" | "expired" | "fetchFailed";

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

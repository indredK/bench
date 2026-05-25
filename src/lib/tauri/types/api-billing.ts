/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export type AccountSessionStatus = "ready" | "loginRequired" | "expired";

export type LoginMethod = "emailCode" | "usernamePassword" | "linkedLink" | "phoneCode";

export interface RelayStation {
  id: string;
  remark: string;
  website: string;
  probeUrl: string | null;
  createdAt: string;
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
  | "CLIPBOARD_FAIL"
  | "WEBVIEW_FAIL"
  | "PROBE_TIMEOUT"
  | "PROBE_NETWORK";

export interface ApiBillingError {
  code: ApiBillingErrorCode;
  message: string;
}

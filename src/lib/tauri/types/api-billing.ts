/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export type AccountSessionStatus = "ready" | "loginRequired" | "expired";

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

export type ApiBillingErrorCode = "NOT_FOUND" | "INVALID_INPUT" | "STORE_FAIL";

export interface ApiBillingError {
  code: ApiBillingErrorCode;
  message: string;
}

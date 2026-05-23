/**
 * IPC Types / 通信类型: mirror payload shapes only; 只定义通信数据形状.
 */
export interface AppInfo {
  appId: string;
  name: string;
  version: string;
  bundleId: string;
  installPath: string;
  source: string;
  sourceType: string;
  sourceId: string;
  sourceConfidence: number;
  canUpgrade: boolean;
  canUninstall: boolean;
  upgradeAvailable: boolean;
  lastOperationResult: string | null;
  lastModified: number;
  isSystemApp: boolean;
  iconBase64: string | null;
  allowedActions: {
    launch: boolean;
    reveal: boolean;
    upgrade: boolean;
    uninstall: boolean;
  };
}

export type AppIconBase64 = string | null;

export interface PlatformCapabilities {
  brewAvailable: boolean;
  wingetAvailable: boolean;
  flatpakAvailable: boolean;
  snapAvailable: boolean;
  aptAvailable: boolean;
}

export interface AppScanResult {
  apps: AppInfo[];
  totalCount: number;
  userCount: number;
  systemCount: number;
  scanTimeMs: number;
  managedCount: number;
  platformCapabilities: PlatformCapabilities;
  lastScanTime: number;
  lastUpdateCheck: number;
}

export interface OperationResult {
  success: boolean;
  message: string;
  exitCode: number | null;
  errorCode: string | null;
  permissionIssue: boolean;
}

export interface BatchItemResult {
  appId: string;
  appName: string;
  success: boolean;
  message: string;
  exitCode: number | null;
}

export interface BatchOperationResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BatchItemResult[];
}

export interface OperationRecord {
  timestamp: number;
  action: string;
  appId: string;
  appName: string;
  success: boolean;
  output: string;
  exitCode: number | null;
  errorCode: string | null;
  permissionIssue: boolean;
}

export interface InstallSource {
  brew?: string;
  winget?: string;
  apt?: string;
  flatpak?: string;
  snap?: string;
  url?: string;
}

export interface InstallListAppInfo {
  _virtual: true;
  id: string;
  name: string;
  bundleId: string;
  category: string;
  series: string;
  description: string;
  installSource: InstallSource;
  iconKey: string;
  installed: boolean;
  installedAppId?: string;
  installedVersion?: string;
  installedPath?: string;
}

export type UninstalledAppInfo = InstallListAppInfo;

export type AppManagerItem = AppInfo | InstallListAppInfo;

export type UpdateSource =
  | "homebrew"
  | "macAppStore"
  | "sparkle"
  | "electron"
  | "squirrel"
  | "gitHub";

export interface UpdateInfo {
  appId: string;
  appName: string;
  source: UpdateSource;
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string | null;
  adamId: string | null;
  releaseNotesUrl: string | null;
  releaseNotesInline: string | null;
  size: number | null;
  sourceMeta: unknown;
  feedUrl: string | null;
  ignored: boolean;
}

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

/**
 * v1.2: phases of an in-progress install. The Rust side serializes this with
 * `#[serde(rename_all = "camelCase", tag = "phase")]`, so each event payload
 * is a discriminated union keyed by the `phase` field. Pattern-match on `phase`
 * in stores / dialogs — never index by string elsewhere.
 */
export type InstallPhase =
  | { phase: "queued" }
  | { phase: "downloading"; percent: number; bytesTotal: number | null }
  | { phase: "verifying" }
  | { phase: "developerIdChanged"; old: string; new: string }
  | { phase: "extracting" }
  | { phase: "replacing" }
  | { phase: "finalizing" }
  | { phase: "done" }
  | { phase: "failed"; code: string; message: string }
  | { phase: "rolledBack"; reason: string };

/** Event payload for `app-update-install:progress` (v1.2). */
export type InstallProgressEvent = InstallPhase & {
  appId: string;
  elapsedMs: number;
};

/** Event payload for `app-update-install:finished` (v1.2). */
export interface InstallFinishedEvent {
  appId: string;
  success: boolean;
  message: string;
  errorCode: string | null;
}

export interface KillPidResult {
  pid: number;
  success: boolean;
  message: string;
}

export interface ProcessNode {
  pid: number;
  ppid: number;
  name: string;
  command: string;
  children: ProcessNode[];
}

export interface ProcessFingerprint {
  category: string;
  name: string;
  icon: string;
}

export interface PortProcessDetail {
  port: number;
  pids: number[];
  process_trees: ProcessNode[];
  fingerprint: ProcessFingerprint | null;
  error: string | null;
}

export interface ProjectInfo {
  path: string;
  name: string;
  total_size: number;
  target_size: number;
  last_modified: number;
  dependencies_count: number;
  project_type: "NodeJs" | "Python" | "Rust" | "Go" | "General";
  cleanup_potential: number;
  cleanup_paths?: string[];
}

export interface CleanupResult {
  success: boolean;
  cleaned_size: number;
  errors: string[];
}

export interface ScanResult {
  total_projects: number;
  total_size: number;
  total_cleanup_size: number;
  projects: ProjectInfo[];
  scan_time_ms: number;
  aborted: boolean;
}

export interface EnvTool {
  name: string;
  version: string;
  path: string;
  size_bytes: number;
  size_display: string;
  install_time: string;
  available: boolean;
  category: string;
  source: string;
  kind: string;
  status: string;
  detector: string;
  all_paths: string[];
  issue: string;
}

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

export interface SystemInfoData {
  os_name: string;
  os_version: string;
  kernel_version: string;
  hostname: string;
  cpu_brand: string;
  cpu_cores: number;
  total_memory: number;
  available_memory: number;
  used_memory: number;
  memory_usage_percent: number;
  browser_name?: string;
  browser_version?: string;
  platform?: string;
  language?: string;
  screen_resolution?: string;
}


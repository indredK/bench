import { invoke } from "@tauri-apps/api/core";
import type {
  AppScanResult,
  BatchOperationResult,
  CleanupResult,
  EnvTool,
  KillPidResult,
  OperationRecord,
  OperationResult,
  PortProcessDetail,
  ProjectInfo,
  ScanResult,
  SystemInfoData,
} from "@/lib/tauri/types";

export function queryPortProcesses(ports: number[]) {
  return invoke<PortProcessDetail[]>("query_port_processes", { ports });
}

export function killProcesses(pids: number[]) {
  return invoke<KillPidResult[]>("kill_processes", { pids });
}

export function scanDevProjects(rootPath: string) {
  return invoke<ScanResult>("scan_dev_projects", { rootPath });
}

export function stopDevProjectScan() {
  return invoke<void>("stop_scan");
}

export function cleanupProjects(projects: ProjectInfo[]) {
  return invoke<CleanupResult>("cleanup_projects", { projects });
}

export function getSystemInfo() {
  return invoke<SystemInfoData>("get_system_info");
}

export function detectEnvTools() {
  return invoke<void>("detect_env_tools");
}

export function scanInstalledApps() {
  return invoke<AppScanResult>("scan_installed_apps");
}

export function launchApp(appPath: string) {
  return invoke<void>("launch_app", { appPath });
}

export function revealAppInFinder(appPath: string) {
  return invoke<void>("reveal_app_in_finder", { appPath });
}

export function checkManagedAppUpdates(appIds: string[]) {
  return invoke<string[]>("check_managed_app_updates", { appIds });
}

export function upgradeApp(appId: string) {
  return invoke<OperationResult>("upgrade_app", { appId });
}

export function uninstallApp(appId: string) {
  return invoke<OperationResult>("uninstall_app", { appId });
}

export function getAppOperationHistory(appId?: string) {
  return invoke<OperationRecord[]>("get_app_operation_history", { appId: appId || null });
}

export function batchUpgradeApps(appIds: string[]) {
  return invoke<BatchOperationResult>("batch_upgrade_apps", { appIds });
}

export function batchUninstallApps(appIds: string[]) {
  return invoke<BatchOperationResult>("batch_uninstall_apps", { appIds });
}

export function refreshAppUpdates(appIds: string[]) {
  return invoke<string[]>("refresh_app_updates", { appIds });
}

export type { EnvTool };


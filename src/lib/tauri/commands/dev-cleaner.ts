import { invoke } from "@tauri-apps/api/core";
import type {
  CleanupResult,
  ProjectInfo,
  ScanResult,
} from "@/lib/tauri/types/dev-cleaner";

export function scanDevProjects(rootPath: string) {
  return invoke<ScanResult>("scan_dev_projects", { rootPath });
}

export function stopDevProjectScan() {
  return invoke<void>("stop_scan");
}

export function cleanupProjects(projects: ProjectInfo[]) {
  return invoke<CleanupResult>("cleanup_projects", { projects });
}

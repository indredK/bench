import type { RowSelectionState } from "@tanstack/react-table";
import type { ProjectInfo, ScanResult } from "@/lib/tauri/types/dev-cleaner";
import { devCleanerRepository } from "@/features/dev-cleaner/services/dev-cleaner.repository";
import { isDesktopRuntime } from "@/platform/runtime";

export interface CleanupMessage {
  type: "success" | "error";
  text: string;
}

export const devCleanerUseCases = {
  isAvailable() {
    return isDesktopRuntime();
  },

  selectDirectory() {
    return devCleanerRepository.selectDirectory();
  },

  scanProjects(rootPath: string) {
    return devCleanerRepository.scanProjects(rootPath);
  },

  stopScan() {
    return devCleanerRepository.stopScan();
  },

  getSelectedProjects(
    scanResult: ScanResult | null,
    selectedProjects: RowSelectionState
  ): ProjectInfo[] {
    return scanResult?.projects.filter((project) => selectedProjects[project.path]) ?? [];
  },

  cleanupProjects(projects: ProjectInfo[]) {
    return devCleanerRepository.cleanupProjects(projects);
  },

  createScanStoppedMessage(result: ScanResult): CleanupMessage | null {
    return result.aborted
      ? {
          type: "success",
          text: `Scan stopped. Found ${result.total_projects} projects`,
        }
      : null;
  },
};

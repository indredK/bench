/**
 * Use Case / 用例层: coordinate business rules; 只编排业务规则.
 */
import type { RowSelectionState } from "@tanstack/react-table"
import type { TFunction } from "i18next"
import type { ProjectInfo, ScanResult } from "@/lib/tauri/types/dev-cleaner"
import { devCleanerRepository } from "@/features/dev-cleaner/services/dev-cleaner.repository"
import { canUseDesktopFeatures } from "@/platform/capabilities"
import { formatSize } from "@/lib/utils"

export interface CleanupMessage {
  type: "success" | "error"
  text: string
}

export const devCleanerUseCases = {
  isAvailable() {
    return canUseDesktopFeatures()
  },

  selectDirectory() {
    return devCleanerRepository.selectDirectory()
  },

  scanProjects(rootPath: string) {
    return devCleanerRepository.scanProjects(rootPath)
  },

  stopScan() {
    return devCleanerRepository.stopScan()
  },

  getSelectedProjects(
    scanResult: ScanResult | null,
    selectedProjects: RowSelectionState,
  ): ProjectInfo[] {
    return scanResult?.projects.filter((project) => selectedProjects[project.path]) ?? []
  },

  cleanupProjects(projects: ProjectInfo[]) {
    return devCleanerRepository.cleanupProjects(projects)
  },

  createScanStoppedMessage(result: ScanResult, t: TFunction): CleanupMessage | null {
    return result.aborted
      ? {
          type: "success",
          text: t("devCleaner.scanStopped", {
            count: result.total_projects,
            size: formatSize(result.total_cleanup_size),
          }),
        }
      : null
  },
}

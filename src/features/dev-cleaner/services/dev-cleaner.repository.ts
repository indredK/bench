/**
 * Repository / 仓储层: adapt external APIs; 只适配外部接口.
 */
import {
  cleanupProjects,
  scanDevProjects,
  stopDevProjectScan,
} from "@/lib/tauri/commands/dev-cleaner";
import type { ProjectInfo } from "@/lib/tauri/types/dev-cleaner";
import { openPlatformDialog } from "@/platform/dialog";

export const devCleanerRepository = {
  selectDirectory() {
    return openPlatformDialog({
      directory: true,
      multiple: false,
      title: "Select Directory to Scan",
    });
  },
  scanProjects(rootPath: string) {
    return scanDevProjects(rootPath);
  },
  stopScan() {
    return stopDevProjectScan();
  },
  cleanupProjects(projects: ProjectInfo[]) {
    return cleanupProjects(projects);
  },
};

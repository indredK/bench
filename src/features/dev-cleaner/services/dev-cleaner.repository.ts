import { open } from "@tauri-apps/plugin-dialog";
import {
  cleanupProjects,
  scanDevProjects,
  stopDevProjectScan,
} from "@/lib/tauri/commands/dev-cleaner";
import type { ProjectInfo } from "@/lib/tauri/types/dev-cleaner";

export const devCleanerRepository = {
  selectDirectory() {
    return open({
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

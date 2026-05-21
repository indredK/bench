/**
 * Use Case / 用例层: coordinate business rules; 只编排业务规则.
 */
import type { SystemInfoData } from "@/lib/tauri/types/system-info";
import { canUseTauriCommands } from "@/platform/capabilities";
import { getBrowserSystemInfo } from "@/platform/browser-info";
import { systemInfoRepository } from "@/features/system-info/services/system-info.repository";

export const systemInfoUseCases = {
  async loadSystemInfo(): Promise<SystemInfoData> {
    if (canUseTauriCommands()) {
      return systemInfoRepository.getSystemInfo();
    }

    return getBrowserSystemInfo();
  },
};

import type { EnvScanDonePayload } from "@/lib/tauri/types/env-detector";
import { envDetectorRepository } from "@/features/env-detector/services/env-detector.repository";
import { canUseDesktopFeatures } from "@/platform/capabilities";

export const envDetectorUseCases = {
  isAvailable() {
    return canUseDesktopFeatures();
  },

  scanEnvTools(): Promise<EnvScanDonePayload> {
    return envDetectorRepository.scanEnvTools();
  },
};

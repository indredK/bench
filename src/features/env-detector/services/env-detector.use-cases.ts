import type { EnvScanDonePayload } from "@/lib/tauri/types/env-detector";
import { envDetectorRepository } from "@/features/env-detector/services/env-detector.repository";
import { isDesktopRuntime } from "@/platform/runtime";

export const envDetectorUseCases = {
  isAvailable() {
    return isDesktopRuntime();
  },

  scanEnvTools(): Promise<EnvScanDonePayload> {
    return envDetectorRepository.scanEnvTools();
  },
};

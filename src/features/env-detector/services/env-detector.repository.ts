import { TAURI_EVENTS } from "@/lib/tauri/contracts";
import { detectEnvTools } from "@/lib/tauri/commands/env-detector";
import type { EnvScanDonePayload } from "@/lib/tauri/types/env-detector";
import { listenToPlatformEvent } from "@/platform/events";

export const envDetectorRepository = {
  async scanEnvTools() {
    let unlisten: (() => void) | null = null;
    let resolvePayload: (payload: EnvScanDonePayload) => void;
    const payloadPromise = new Promise<EnvScanDonePayload>((resolve) => {
      resolvePayload = resolve;
    });

    try {
      unlisten = await listenToPlatformEvent<EnvScanDonePayload>(TAURI_EVENTS.envDetector.scanDone, (event) => {
        resolvePayload(event.payload);
        unlisten?.();
        unlisten = null;
      });

      await detectEnvTools();
      return await payloadPromise;
    } catch (error) {
      unlisten?.();
      throw error;
    }
  },
};

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { detectEnvTools } from "@/lib/tauri/commands/env-detector";
import type { EnvScanDonePayload } from "@/lib/tauri/types/env-detector";

export const envDetectorRepository = {
  async scanEnvTools() {
    let unlisten: UnlistenFn | null = null;
    let resolvePayload: (payload: EnvScanDonePayload) => void;
    const payloadPromise = new Promise<EnvScanDonePayload>((resolve) => {
      resolvePayload = resolve;
    });

    try {
      unlisten = await listen<EnvScanDonePayload>("env-scan-done", (event) => {
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

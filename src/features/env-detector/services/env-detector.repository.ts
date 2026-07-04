/**
 * Repository / 仓储层: adapt external APIs; 只适配外部接口.
 */
import { TAURI_EVENTS } from "@/lib/tauri/contracts"
import { detectEnvTools } from "@/lib/tauri/commands/env-detector"
import type { EnvScanDonePayload } from "@/lib/tauri/types/env-detector"
import { listenToPlatformEvent } from "@/platform/events"

// Backend caps individual probes (3 s per tool, 4 s shell PATH) and an
// 80-tool budget, so a healthy machine finishes well under 30 s. A 90 s ceiling
// is generous enough to absorb cold disks while still freeing the UI when the
// backend panics before emitting `env-scan-done` (#075).
const SCAN_TIMEOUT_MS = 90_000

export class EnvScanTimeoutError extends Error {
  constructor() {
    super("Environment scan timed out")
    this.name = "EnvScanTimeoutError"
  }
}

export const envDetectorRepository = {
  async scanEnvTools(): Promise<EnvScanDonePayload> {
    let unlisten: (() => void) | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let resolvePayload!: (payload: EnvScanDonePayload) => void
    let rejectPayload!: (reason: unknown) => void
    const payloadPromise = new Promise<EnvScanDonePayload>((resolve, reject) => {
      resolvePayload = resolve
      rejectPayload = reject
    })

    const cleanup = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      unlisten?.()
      unlisten = null
    }

    try {
      unlisten = await listenToPlatformEvent<EnvScanDonePayload>(
        TAURI_EVENTS.envDetector.scanDone,
        (event) => {
          cleanup()
          resolvePayload(event.payload)
        },
      )

      timeoutId = setTimeout(() => {
        cleanup()
        rejectPayload(new EnvScanTimeoutError())
      }, SCAN_TIMEOUT_MS)

      await detectEnvTools()
      return await payloadPromise
    } catch (error) {
      cleanup()
      throw error
    }
  },
}

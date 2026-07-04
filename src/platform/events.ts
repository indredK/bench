/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
import type {
  EventCallback,
  EventName,
  EventTarget,
  Options,
  UnlistenFn,
} from "@tauri-apps/api/event"
import { canUseTauriEvents } from "@/platform/capabilities"

export async function listenToPlatformEvent<T>(
  event: EventName,
  handler: EventCallback<T>,
  options?: Options,
): Promise<UnlistenFn> {
  if (!canUseTauriEvents()) {
    return () => {}
  }

  const { listen } = await import("@tauri-apps/api/event")
  return listen<T>(event, handler, options)
}

export async function emitPlatformEvent<T>(event: EventName, payload?: T): Promise<void> {
  if (!canUseTauriEvents()) return

  const { emit } = await import("@tauri-apps/api/event")
  await emit<T>(event, payload)
}

export async function emitPlatformEventTo<T>(
  target: EventTarget | string,
  event: EventName,
  payload?: T,
): Promise<void> {
  if (!canUseTauriEvents()) return

  const { emitTo } = await import("@tauri-apps/api/event")
  await emitTo<T>(target, event, payload)
}

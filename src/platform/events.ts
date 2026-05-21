import type { EventCallback, EventName, Options, UnlistenFn } from "@tauri-apps/api/event";
import { canUseTauriEvents } from "@/platform/capabilities";

export async function listenToPlatformEvent<T>(
  event: EventName,
  handler: EventCallback<T>,
  options?: Options
): Promise<UnlistenFn> {
  if (!canUseTauriEvents()) {
    return () => {};
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, handler, options);
}

import { open as openExternalUrl } from "@tauri-apps/plugin-shell";
import { isDesktopRuntime } from "@/platform/runtime";

export function openExternal(reference: string) {
  if (isDesktopRuntime()) {
    return openExternalUrl(reference);
  }

  window.open(reference, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}

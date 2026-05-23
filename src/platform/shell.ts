/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
import { open as openExternalUrl } from "@tauri-apps/plugin-shell";
import { canUseTauriShell } from "@/platform/capabilities";

export async function openExternal(reference: string): Promise<void> {
  if (canUseTauriShell()) {
    try {
      await openExternalUrl(reference);
      return;
    } catch (error) {
      // Tauri shell plugin can reject when the URL's scheme is outside the
      // plugin's configured scope, or when the OS-level open handler fails
      // (e.g. no default browser registered). Fall through to window.open so
      // the user still gets navigation rather than a silent dead click (#091).
      console.warn("[openExternal] tauri shell failed, falling back:", error);
    }
  }
  window.open(reference, "_blank", "noopener,noreferrer");
}

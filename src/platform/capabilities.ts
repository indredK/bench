/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
import { isDesktopRuntime } from "@/platform/runtime";

export type RuntimeKind = "desktop" | "browser";

export type PlatformCapability =
  | "desktop-feature"
  | "tauri-command"
  | "tauri-dialog"
  | "tauri-event"
  | "tauri-shell"
  | "tauri-window";

export function getRuntimeKind(): RuntimeKind {
  return isDesktopRuntime() ? "desktop" : "browser";
}

export function hasPlatformCapability(capability: PlatformCapability): boolean {
  switch (capability) {
    case "desktop-feature":
    case "tauri-command":
    case "tauri-dialog":
    case "tauri-event":
    case "tauri-shell":
    case "tauri-window":
      return getRuntimeKind() === "desktop";
  }
}

export function canUseDesktopFeatures(): boolean {
  return hasPlatformCapability("desktop-feature");
}

export function canUseTauriCommands(): boolean {
  return hasPlatformCapability("tauri-command");
}

export function canUseTauriDialog(): boolean {
  return hasPlatformCapability("tauri-dialog");
}

export function canUseTauriEvents(): boolean {
  return hasPlatformCapability("tauri-event");
}

export function canUseTauriShell(): boolean {
  return hasPlatformCapability("tauri-shell");
}

export function canUseTauriWindow(): boolean {
  return hasPlatformCapability("tauri-window");
}

export function canUseFeature(feature?: { desktopOnly?: boolean }): boolean {
  return !feature?.desktopOnly || canUseDesktopFeatures();
}

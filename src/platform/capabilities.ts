/**
 * Platform Adapter / 平台适配: wrap runtime APIs; 统一封装运行时能力.
 */
import { isDesktopRuntime } from "@/platform/runtime"
import { platformName, type PlatformName } from "@/platform/config"

export type RuntimeKind = "desktop" | "browser"

export type PlatformCapability =
  | "desktop-feature"
  | "tauri-command"
  | "tauri-dialog"
  | "tauri-event"
  | "tauri-shell"
  | "tauri-window"

export type FeatureGateReason = "desktop-only" | "platform-unsupported"

export interface FeatureGateResult {
  gated: boolean
  reason?: FeatureGateReason
  platform?: PlatformName
}

export interface RuntimeEnvironment {
  runtime: RuntimeKind
  platform: PlatformName
}

export function getRuntimeKind(): RuntimeKind {
  return isDesktopRuntime() ? "desktop" : "browser"
}

export function getRuntimeEnvironment(): RuntimeEnvironment {
  return {
    runtime: getRuntimeKind(),
    platform: platformName,
  }
}

export function hasPlatformCapability(capability: PlatformCapability): boolean {
  switch (capability) {
    case "desktop-feature":
    case "tauri-command":
    case "tauri-dialog":
    case "tauri-event":
    case "tauri-shell":
    case "tauri-window":
      return getRuntimeKind() === "desktop"
  }
}

export function canUseDesktopFeatures(): boolean {
  return hasPlatformCapability("desktop-feature")
}

export function canUseTauriCommands(): boolean {
  return hasPlatformCapability("tauri-command")
}

export function canUseTauriDialog(): boolean {
  return hasPlatformCapability("tauri-dialog")
}

export function canUseTauriEvents(): boolean {
  return hasPlatformCapability("tauri-event")
}

export function canUseTauriShell(): boolean {
  return hasPlatformCapability("tauri-shell")
}

export function canUseTauriWindow(): boolean {
  return hasPlatformCapability("tauri-window")
}

export type FeatureDescriptor = { desktopOnly?: boolean; platforms?: PlatformName[] }

export function canUseFeature(
  feature?: FeatureDescriptor,
  environment: RuntimeEnvironment = getRuntimeEnvironment(),
): boolean {
  return !getFeatureGateReason(feature, environment).gated
}

export function getFeatureGateReason(
  feature?: FeatureDescriptor,
  environment: RuntimeEnvironment = getRuntimeEnvironment(),
): FeatureGateResult {
  if (feature?.desktopOnly && environment.runtime !== "desktop") {
    return { gated: true, reason: "desktop-only" }
  }
  if (feature?.platforms && !feature.platforms.includes(environment.platform)) {
    return { gated: true, reason: "platform-unsupported", platform: environment.platform }
  }
  return { gated: false }
}

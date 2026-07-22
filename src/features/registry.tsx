/**
 * Feature Registry / 功能注册: compose descriptors only; 只聚合功能描述.
 *
 * v2: 侧边栏精简 — 端口管理/环境检测/Token计算收进开发工具箱，
 * 存储空间清理（clean-space）作为顶层主菜单模块。
 */
import type { TFunction } from "i18next"
import { accountManagerFeature } from "@/features/account-manager/feature"
import { appManagerFeature } from "@/features/app-manager/feature"
import { cleanSpaceFeature } from "@/features/clean-space/feature"
import { commandCenterFeature } from "@/features/command-center/feature"
import { envDetectorFeature } from "@/features/env-detector/feature"
import { hardwareFeature } from "@/features/hardware/feature"
import { networkProbeFeature } from "@/features/network-probe/feature"
import { portManagerFeature } from "@/features/port-manager/feature"
import { quickLaunchFeature } from "@/features/quick-launch/feature"
import { tokenCalculatorFeature } from "@/features/token-calculator/feature"
import { terminologyFeature } from "@/features/terminology/feature"
import { systemSettingsFeature } from "@/features/system-settings/feature"
import { devToolboxFeature } from "@/features/dev-toolbox/feature"
import type { AppFeature, NavigationItem } from "@/features/types"
import { canUseFeature, type RuntimeEnvironment } from "@/platform/capabilities"

/** All features (for routing); order matters for sidebar. */
export const appFeatures: AppFeature[] = [
  quickLaunchFeature,
  commandCenterFeature,
  appManagerFeature,
  hardwareFeature,
  networkProbeFeature,
  terminologyFeature,
  accountManagerFeature,
  // Development tools — routed but condensed into dev-toolbox in sidebar
  devToolboxFeature,
  portManagerFeature,
  cleanSpaceFeature,
  envDetectorFeature,
  tokenCalculatorFeature,
  // Config
  systemSettingsFeature,
]

/** IDs hidden from sidebar (shown as tabs inside Dev Toolbox instead). */
const TOOLBOX_FEATURE_IDS = new Set(["port-manager", "env-detector", "token-calculator"])

export function getFeatureByPath(path: string): AppFeature | undefined {
  return appFeatures.find((feature) => feature.path === path)
}

/** Sidebar nav items (excluding toolbox sub-items and system-settings). */
export function createNavigationItems(
  t: TFunction,
  environment?: RuntimeEnvironment,
): NavigationItem[] {
  return appFeatures
    .filter(
      (feature) =>
        !TOOLBOX_FEATURE_IDS.has(feature.id) &&
        feature.id !== "system-settings" &&
        canUseFeature(feature, environment),
    )
    .map((feature) => ({
      path: feature.path,
      name: t(feature.labelKey),
      icon: feature.icon,
    }))
}

/** Config/tool navigation items shown below separator in sidebar. */
export function createConfigItems(
  t: TFunction,
  environment?: RuntimeEnvironment,
): NavigationItem[] {
  const settings = appFeatures.find(
    (feature) => feature.id === "system-settings" && canUseFeature(feature, environment),
  )
  if (!settings) return []
  return [
    {
      path: settings.path,
      name: t(settings.labelKey),
      icon: settings.icon,
    },
  ]
}

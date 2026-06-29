/**
 * Feature Registry / 功能注册: compose descriptors only; 只聚合功能描述.
 *
 * v2: 侧边栏精简 — 端口管理/开发清理/环境检测/Token计算收进开发工具箱，
 * 侧边栏只展示 4 个一级入口 + 系统设置。
 */
import type { TFunction } from "i18next";
import { apiBillingFeature } from "@/features/api-billing/feature";
import { appManagerFeature } from "@/features/app-manager/feature";
import { devCleanerFeature } from "@/features/dev-cleaner/feature";
import { envDetectorFeature } from "@/features/env-detector/feature";
import { hardwareFeature } from "@/features/hardware/feature";
import { portManagerFeature } from "@/features/port-manager/feature";
import { quickLaunchFeature } from "@/features/quick-launch/feature";
import { tokenCalculatorFeature } from "@/features/token-calculator/feature";
import { terminologyFeature } from "@/features/terminology/feature";
import { systemSettingsFeature } from "@/features/system-settings/feature";
import { devToolboxFeature } from "@/features/dev-toolbox/feature";
import type { AppFeature, NavigationItem } from "@/features/types";

/** All features (for routing); order matters for sidebar. */
export const appFeatures: AppFeature[] = [
  quickLaunchFeature,
  appManagerFeature,
  hardwareFeature,
  terminologyFeature,
  apiBillingFeature,
  // Development tools — routed but condensed into dev-toolbox in sidebar
  devToolboxFeature,
  portManagerFeature,
  devCleanerFeature,
  envDetectorFeature,
  tokenCalculatorFeature,
  // Config
  systemSettingsFeature,
];

/** IDs hidden from sidebar (shown as tabs inside Dev Toolbox instead). */
const TOOLBOX_FEATURE_IDS = new Set([
  "port-manager",
  "dev-cleaner",
  "env-detector",
  "token-calculator",
]);

export function getFeatureByPath(path: string): AppFeature | undefined {
  return appFeatures.find((feature) => feature.path === path);
}

/** Sidebar nav items (excluding toolbox sub-items and system-settings). */
export function createNavigationItems(t: TFunction): NavigationItem[] {
  return appFeatures
    .filter((f) => !TOOLBOX_FEATURE_IDS.has(f.id) && f.id !== "system-settings")
    .map((feature) => ({
      path: feature.path,
      name: t(feature.labelKey),
      icon: feature.icon,
    }));
}

/** Config/tool navigation items shown below separator in sidebar. */
export function createConfigItems(t: TFunction): NavigationItem[] {
  const settings = appFeatures.find((f) => f.id === "system-settings");
  if (!settings) return [];
  return [{
    path: settings.path,
    name: t(settings.labelKey),
    icon: settings.icon,
  }];
}

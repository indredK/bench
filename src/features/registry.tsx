/**
 * Feature Registry / 功能注册: compose descriptors only; 只聚合功能描述.
 */
import type { TFunction } from "i18next";
import { apiBillingFeature } from "@/features/api-billing/feature";
import { appManagerFeature } from "@/features/app-manager/feature";
import { devCleanerFeature } from "@/features/dev-cleaner/feature";
import { envDetectorFeature } from "@/features/env-detector/feature";
import { hardwareFeature } from "@/features/hardware/feature";
import { portManagerFeature } from "@/features/port-manager/feature";
import { tokenCalculatorFeature } from "@/features/token-calculator/feature";
import { terminologyFeature } from "@/features/terminology/feature";
import { systemSettingsFeature } from "@/features/system-settings/feature";
import { devToolboxFeature } from "@/features/dev-toolbox/feature";
import type { AppFeature, NavigationItem } from "@/features/types";

export const appFeatures: AppFeature[] = [
  portManagerFeature,
  appManagerFeature,
  devCleanerFeature,
  hardwareFeature,
  envDetectorFeature,
  apiBillingFeature,
  tokenCalculatorFeature,
  terminologyFeature,
  devToolboxFeature,
  systemSettingsFeature,
];

export function getFeatureByPath(path: string): AppFeature | undefined {
  return appFeatures.find((feature) => feature.path === path);
}

/** Feature navigation items (shown above separator in sidebar) */
export function createNavigationItems(t: TFunction): NavigationItem[] {
  return appFeatures
    .filter((f) => f.id !== "system-settings")
    .map((feature) => ({
      path: feature.path,
      name: t(feature.labelKey),
      icon: feature.icon,
    }));
}

/** Config/tool navigation items (shown below separator in sidebar — e.g. System Settings) */
export function createConfigItems(t: TFunction): NavigationItem[] {
  const settings = appFeatures.find((f) => f.id === "system-settings");
  if (!settings) return [];
  return [{
    path: settings.path,
    name: t(settings.labelKey),
    icon: settings.icon,
  }];
}

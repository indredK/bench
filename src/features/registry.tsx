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
import { systemInfoFeature } from "@/features/system-info/feature";
import { tokenCalculatorFeature } from "@/features/token-calculator/feature";
import type { AppFeature, NavigationItem } from "@/features/types";

export const appFeatures: AppFeature[] = [
  portManagerFeature,
  appManagerFeature,
  devCleanerFeature,
  hardwareFeature,
  systemInfoFeature,
  envDetectorFeature,
  apiBillingFeature,
  tokenCalculatorFeature,
];

export function getFeatureByPath(path: string): AppFeature | undefined {
  return appFeatures.find((feature) => feature.path === path);
}

export function createNavigationItems(t: TFunction): NavigationItem[] {
  return appFeatures.map((feature) => ({
    path: feature.path,
    name: t(feature.labelKey),
    icon: feature.icon,
  }));
}

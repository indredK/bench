/**
 * Feature Model / 功能模型: keep pure model logic; 只放纯模型逻辑.
 */
import type { TFunction } from "i18next";
import type { UpdateSource } from "@/lib/tauri/types/app-manager";

export const UPDATE_SOURCE_ORDER: UpdateSource[] = [
  "homebrew",
  "macAppStore",
  "sparkle",
  "electron",
  "squirrel",
  "gitHub",
];

const SOURCE_ICON: Record<UpdateSource, string> = {
  homebrew: "🍺",
  macAppStore: "📱",
  sparkle: "✨",
  electron: "⚡",
  squirrel: "🐿️",
  gitHub: "🐙",
};

const SOURCE_LABEL_KEY: Record<UpdateSource, string> = {
  homebrew: "appManager.softwareUpdate.source.homebrew",
  macAppStore: "appManager.softwareUpdate.source.appStore",
  sparkle: "appManager.softwareUpdate.source.sparkle",
  electron: "appManager.softwareUpdate.source.electron",
  squirrel: "appManager.softwareUpdate.source.squirrel",
  gitHub: "appManager.softwareUpdate.source.github",
};

export function getUpdateSourceIcon(source: UpdateSource): string {
  return SOURCE_ICON[source];
}

export function getUpdateSourceLabel(t: TFunction, source: UpdateSource): string {
  return t(SOURCE_LABEL_KEY[source]);
}

export function getUpdateActionKey(source: UpdateSource): string {
  switch (source) {
    case "homebrew":
      return "appManager.softwareUpdate.action.update";
    case "macAppStore":
      return "appManager.softwareUpdate.action.openAppStore";
    case "gitHub":
      return "appManager.softwareUpdate.action.openReleases";
    case "sparkle":
    case "electron":
    case "squirrel":
    default:
      return "appManager.softwareUpdate.action.openDownloadPage";
  }
}

export function formatBytes(size: number | null | undefined): string {
  if (size === null || size === undefined || size <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const formatted = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

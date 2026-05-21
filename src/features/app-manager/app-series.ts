import type { AppInfo } from "@/lib/tauri/types";

export type AppSeriesKey =
  | "google"
  | "microsoft"
  | "apple"
  | "tencent"
  | "bytedance"
  | "alibaba"
  | "baidu"
  | "openai"
  | "other";

export interface AppSeries {
  key: AppSeriesKey;
  labelKey: string;
}

export const APP_SERIES: AppSeries[] = [
  { key: "google", labelKey: "appManager.series.google" },
  { key: "microsoft", labelKey: "appManager.series.microsoft" },
  { key: "apple", labelKey: "appManager.series.apple" },
  { key: "tencent", labelKey: "appManager.series.tencent" },
  { key: "bytedance", labelKey: "appManager.series.bytedance" },
  { key: "alibaba", labelKey: "appManager.series.alibaba" },
  { key: "baidu", labelKey: "appManager.series.baidu" },
  { key: "openai", labelKey: "appManager.series.openai" },
  { key: "other", labelKey: "appManager.series.other" },
];

export function classifySeries(app: AppInfo): AppSeriesKey {
  const bid = app.bundleId.toLowerCase();

  if (
    bid.includes("com.google.")
  ) {
    return "google";
  }

  if (
    bid.includes("com.microsoft.") ||
    bid.includes("com.github.") ||
    bid.includes("com.skype.")
  ) {
    return "microsoft";
  }

  if (
    bid.includes("com.apple.") ||
    bid.includes("developer.apple.")
  ) {
    return "apple";
  }

  if (
    bid.includes("com.tencent.") ||
    bid.includes("com.workbuddy.")
  ) {
    return "tencent";
  }

  if (
    bid.includes("com.bytedance.") ||
    bid.includes("com.bot.pc.") ||
    bid.includes("com.lemon.") ||
    bid.includes("com.larksuite.") ||
    bid.includes("com.electron.lark")
  ) {
    return "bytedance";
  }

  if (
    bid.includes("com.alibaba.") ||
    bid.includes("com.aliyun.") ||
    bid.includes("com.mnn.")
  ) {
    return "alibaba";
  }

  if (
    bid.includes("com.baidu.") ||
    bid.includes("com.easydataset.")
  ) {
    return "baidu";
  }

  if (bid.includes("com.openai.")) {
    return "openai";
  }

  return "other";
}
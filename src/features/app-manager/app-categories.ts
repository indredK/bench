import type { AppInfo } from "@/lib/tauri/types";

export type AppCategoryKey =
  | "ai"
  | "browser"
  | "communication"
  | "compiler"
  | "launcher"
  | "utility"
  | "development"
  | "other";

export interface AppCategory {
  key: AppCategoryKey;
  labelKey: string;
}

export const APP_CATEGORIES: AppCategory[] = [
  { key: "ai", labelKey: "appManager.category.ai" },
  { key: "browser", labelKey: "appManager.category.browser" },
  { key: "communication", labelKey: "appManager.category.communication" },
  { key: "compiler", labelKey: "appManager.category.compiler" },
  { key: "launcher", labelKey: "appManager.category.launcher" },
  { key: "utility", labelKey: "appManager.category.utility" },
  { key: "development", labelKey: "appManager.category.development" },
  { key: "other", labelKey: "appManager.category.other" },
];

export function classifyApp(app: AppInfo): AppCategoryKey {
  const bid = app.bundleId.toLowerCase();
  const name = app.name.toLowerCase();

  if (
    bid.includes("com.openai.") ||
    bid.includes("com.anthropic.") ||
    name.includes("chatgpt") ||
    name.includes("claude") ||
    name.includes("doubao") ||
    name.includes("kimi") ||
    name.includes("copilot") ||
    name.includes("文心") ||
    name.includes("通义") ||
    name.includes("gemini") ||
    name.includes("deepseek")
  ) {
    return "ai";
  }

  if (
    bid.includes("com.apple.safari") ||
    bid.includes("com.google.chrome") ||
    bid.includes("org.mozilla.") ||
    bid.includes("com.microsoft.edgemac") ||
    bid.includes("com.operasoftware.") ||
    bid.includes("com.brave.") ||
    bid.includes("company.thebrowser.") ||
    name.includes("浏览器") ||
    name.includes("browser")
  ) {
    return "browser";
  }

  if (
    bid.includes("com.tencent.xinwechat") ||
    bid.includes("com.tencent.qq") ||
    bid.includes("com.alibaba.dingtalk") ||
    bid.includes("com.bytedance.lark") ||
    bid.includes("com.tinyspeck.slack") ||
    bid.includes("com.microsoft.teams") ||
    bid.includes("us.zoom.") ||
    bid.includes("com.skype.") ||
    bid.includes("com.viber.") ||
    bid.includes("com.discordapp.") ||
    name.includes("微信") ||
    name.includes("钉钉") ||
    name.includes("飞书") ||
    name.includes("sip")
  ) {
    return "communication";
  }

  if (
    bid.includes("com.openclaw") ||
    bid.includes("com.alfredapp.") ||
    bid.includes("com.raycast.") ||
    bid.includes("com.obdev.launchbar") ||
    name.includes("openclaw") ||
    name.includes("alfred") ||
    name.includes("raycast")
  ) {
    return "launcher";
  }

  if (
    bid.includes("com.microsoft.vscode") ||
    bid.includes("com.apple.dt.") ||
    bid.includes("com.jetbrains.") ||
    bid.includes("com.sublimetext.") ||
    bid.includes("com.cursor.") ||
    bid.includes("com.trae.") ||
    name.includes("gcc") ||
    name.includes("clang") ||
    name.includes("llvm") ||
    name.includes("rustc") ||
    name.includes("compiler") ||
    name.includes("trae") ||
    name.includes("xcode")
  ) {
    return "compiler";
  }

  if (
    bid.includes("com.github.") ||
    bid.includes("com.sourcetree.") ||
    bid.includes("com.docker.") ||
    name.includes("terminal") ||
    name.includes("iterm") ||
    name.includes("warp")
  ) {
    return "development";
  }

  if (
    bid.startsWith("com.apple.") ||
    app.isSystemApp ||
    name.includes("finder") ||
    name.includes("disk") ||
    name.includes("clean") ||
    name.includes("monitor") ||
    name.includes("unarchiver") ||
    name.includes("keka")
  ) {
    return "utility";
  }

  return "other";
}
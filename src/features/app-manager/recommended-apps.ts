import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";
import type { AppInfo } from "@/lib/tauri/types";

export interface RecommendedApp {
  id: string;
  name: string;
  bundleIdPattern: string;
  category: AppCategoryKey;
  series: AppSeriesKey;
  description: string;
  installSource: {
    brew?: string;
    winget?: string;
    apt?: string;
    flatpak?: string;
    snap?: string;
    url?: string;
  };
  iconKey: string;
  recommended: boolean;
  popularity?: number;
}

export interface RecommendedAppInstallStatus extends RecommendedApp {
  installed: boolean;
  installedAppId?: string;
  installedVersion?: string;
  installedPath?: string;
}

export const RECOMMENDED_APPS: RecommendedApp[] = [
  {
    id: "google-chrome",
    name: "Google Chrome",
    bundleIdPattern: "com.google.chrome",
    category: "browser",
    series: "google",
    description: "Google 出品的跨平台网页浏览器",
    installSource: { brew: "google-chrome", winget: "Google.Chrome", url: "https://www.google.com/chrome/" },
    iconKey: "chrome",
    recommended: true,
    popularity: 100,
  },
  {
    id: "firefox",
    name: "Firefox",
    bundleIdPattern: "org.mozilla.firefox",
    category: "browser",
    series: "other",
    description: "Mozilla 开源网页浏览器,注重隐私保护",
    installSource: { brew: "firefox", winget: "Mozilla.Firefox", url: "https://www.mozilla.org/firefox/" },
    iconKey: "firefox",
    recommended: true,
    popularity: 90,
  },
  {
    id: "arc",
    name: "Arc",
    bundleIdPattern: "company.thebrowser.Arc",
    category: "browser",
    series: "other",
    description: "革新性的现代化浏览器",
    installSource: { brew: "arc", url: "https://arc.net/download" },
    iconKey: "arc",
    recommended: false,
    popularity: 70,
  },
  {
    id: "wechat",
    name: "微信",
    bundleIdPattern: "com.tencent.xinwechat",
    category: "communication",
    series: "tencent",
    description: "腾讯出品的即时通讯软件",
    installSource: { url: "https://mac.weixin.qq.com/" },
    iconKey: "wechat",
    recommended: true,
    popularity: 98,
  },
  {
    id: "qq",
    name: "QQ",
    bundleIdPattern: "com.tencent.qq",
    category: "communication",
    series: "tencent",
    description: "腾讯即时通讯软件",
    installSource: { brew: "qq", url: "https://im.qq.com/" },
    iconKey: "qq",
    recommended: false,
    popularity: 80,
  },
  {
    id: "dingtalk",
    name: "钉钉",
    bundleIdPattern: "com.alibaba.dingtalk",
    category: "communication",
    series: "alibaba",
    description: "阿里巴巴出品,企业级协同办公平台",
    installSource: { brew: "dingtalk", url: "https://www.dingtalk.com/" },
    iconKey: "dingtalk",
    recommended: true,
    popularity: 85,
  },
  {
    id: "lark",
    name: "飞书",
    bundleIdPattern: "com.bytedance.lark,com.larksuite.",
    category: "communication",
    series: "bytedance",
    description: "字节跳动出品,一站式企业协作平台",
    installSource: { brew: "feishu", url: "https://www.feishu.cn/" },
    iconKey: "lark",
    recommended: true,
    popularity: 75,
  },
  {
    id: "slack",
    name: "Slack",
    bundleIdPattern: "com.tinyspeck.slack",
    category: "communication",
    series: "other",
    description: "团队沟通与协作平台",
    installSource: { brew: "slack", winget: "SlackTechnologies.Slack", url: "https://slack.com/downloads" },
    iconKey: "slack",
    recommended: false,
    popularity: 60,
  },
  {
    id: "telegram",
    name: "Telegram",
    bundleIdPattern: "ru.keepcoder.telegram",
    category: "communication",
    series: "other",
    description: "跨平台即时通讯,注重速度和安全性",
    installSource: { brew: "telegram", winget: "Telegram.TelegramDesktop", url: "https://desktop.telegram.org/" },
    iconKey: "telegram",
    recommended: false,
    popularity: 65,
  },
  {
    id: "discord",
    name: "Discord",
    bundleIdPattern: "com.discordapp.",
    category: "communication",
    series: "other",
    description: "游戏玩家和社区的首选语音聊天平台",
    installSource: { brew: "discord", winget: "Discord.Discord", url: "https://discord.com/download" },
    iconKey: "discord",
    recommended: false,
    popularity: 55,
  },
  {
    id: "zoom",
    name: "Zoom",
    bundleIdPattern: "us.zoom.",
    category: "communication",
    series: "other",
    description: "视频会议软件",
    installSource: { brew: "zoom", winget: "Zoom.Zoom", url: "https://www.zoom.com/download" },
    iconKey: "zoom",
    recommended: false,
    popularity: 50,
  },
  {
    id: "vscode",
    name: "Visual Studio Code",
    bundleIdPattern: "com.microsoft.vscode",
    category: "ide",
    series: "microsoft",
    description: "微软出品,轻量级但功能强大的代码编辑器",
    installSource: { brew: "visual-studio-code", winget: "Microsoft.VisualStudioCode", url: "https://code.visualstudio.com/download" },
    iconKey: "vscode",
    recommended: true,
    popularity: 99,
  },
  {
    id: "intellij-idea",
    name: "IntelliJ IDEA",
    bundleIdPattern: "com.jetbrains.intellij",
    category: "ide",
    series: "other",
    description: "JetBrains 出品的 Java IDE",
    installSource: { brew: "intellij-idea", url: "https://www.jetbrains.com/idea/download/" },
    iconKey: "intellij",
    recommended: false,
    popularity: 70,
  },
  {
    id: "cursor",
    name: "Cursor",
    bundleIdPattern: "com.cursor.",
    category: "ide",
    series: "other",
    description: "AI-first 代码编辑器",
    installSource: { brew: "cursor", url: "https://cursor.com/download" },
    iconKey: "cursor",
    recommended: true,
    popularity: 85,
  },
  {
    id: "windsurf",
    name: "Windsurf",
    bundleIdPattern: "com.exafunction.windsurf",
    category: "ide",
    series: "other",
    description: "AI 驱动的 IDE",
    installSource: { url: "https://windsurf.com/windsurf/download" },
    iconKey: "windsurf",
    recommended: false,
    popularity: 65,
  },
  {
    id: "zed",
    name: "Zed",
    bundleIdPattern: "dev.zed.",
    category: "ide",
    series: "other",
    description: "高性能 Rust 编写代码编辑器",
    installSource: { brew: "zed", url: "https://zed.dev/" },
    iconKey: "zed",
    recommended: false,
    popularity: 55,
  },
  {
    id: "sublime-text",
    name: "Sublime Text",
    bundleIdPattern: "com.sublimetext.",
    category: "ide",
    series: "other",
    description: "极速轻量级文本编辑器",
    installSource: { brew: "sublime-text", winget: "SublimeHQ.SublimeText", url: "https://www.sublimetext.com/download" },
    iconKey: "sublime",
    recommended: false,
    popularity: 45,
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    bundleIdPattern: "com.openai.chat",
    category: "ai",
    series: "openai",
    description: "OpenAI 官方桌面客户端",
    installSource: { url: "https://openai.com/chatgpt/desktop/" },
    iconKey: "chatgpt",
    recommended: true,
    popularity: 95,
  },
  {
    id: "claude",
    name: "Claude",
    bundleIdPattern: "com.anthropic.claude",
    category: "ai",
    series: "other",
    description: "Anthropic 出品,AI 助手桌面版",
    installSource: { url: "https://claude.com/download" },
    iconKey: "claude",
    recommended: false,
    popularity: 80,
  },
  {
    id: "ollama",
    name: "Ollama",
    bundleIdPattern: "com.electron.ollama",
    category: "ai",
    series: "other",
    description: "本地运行 LLM 的利器",
    installSource: { brew: "ollama", url: "https://ollama.com/download" },
    iconKey: "ollama",
    recommended: true,
    popularity: 75,
  },
  {
    id: "docker",
    name: "Docker",
    bundleIdPattern: "com.docker.docker",
    category: "development",
    series: "other",
    description: "容器化应用开发平台",
    installSource: { brew: "docker", url: "https://www.docker.com/products/docker-desktop/" },
    iconKey: "docker",
    recommended: true,
    popularity: 95,
  },
  {
    id: "orbstack",
    name: "OrbStack",
    bundleIdPattern: "com.orbstack.orbstack",
    category: "development",
    series: "other",
    description: "macOS 上轻量快速的 Docker 替代方案",
    installSource: { brew: "orbstack", url: "https://orbstack.dev/" },
    iconKey: "orbstack",
    recommended: true,
    popularity: 70,
  },
  {
    id: "figma",
    name: "Figma",
    bundleIdPattern: "com.figma.",
    category: "development",
    series: "other",
    description: "协作式 UI/UX 设计工具",
    installSource: { brew: "figma", url: "https://www.figma.com/downloads/" },
    iconKey: "figma",
    recommended: false,
    popularity: 80,
  },
  {
    id: "postman",
    name: "Postman",
    bundleIdPattern: "com.postmanlabs.",
    category: "development",
    series: "other",
    description: "API 开发和测试工具",
    installSource: { brew: "postman", winget: "Postman.Postman", url: "https://www.postman.com/downloads/" },
    iconKey: "postman",
    recommended: false,
    popularity: 75,
  },
  {
    id: "iterm2",
    name: "iTerm2",
    bundleIdPattern: "com.googlecode.iterm2",
    category: "development",
    series: "other",
    description: "macOS 终端模拟器的替代品,功能更强大",
    installSource: { brew: "iterm2", url: "https://iterm2.com/" },
    iconKey: "iterm2",
    recommended: true,
    popularity: 85,
  },
  {
    id: "warp",
    name: "Warp",
    bundleIdPattern: "dev.warp.WarpStable",
    category: "development",
    series: "other",
    description: "Rust 编写的现代化终端",
    installSource: { brew: "warp", url: "https://www.warp.dev/" },
    iconKey: "warp",
    recommended: false,
    popularity: 60,
  },
  {
    id: "apifox",
    name: "ApiFox",
    bundleIdPattern: "cn.apifox",
    category: "development",
    series: "other",
    description: "API 设计、调试、文档一体化平台",
    installSource: { brew: "apifox", url: "https://apifox.com/" },
    iconKey: "apifox",
    recommended: false,
    popularity: 50,
  },
  {
    id: "raycast",
    name: "Raycast",
    bundleIdPattern: "com.raycast.",
    category: "launcher",
    series: "other",
    description: "效率启动器，Spotlight 的强力替代",
    installSource: { brew: "raycast", url: "https://raycast.com/" },
    iconKey: "raycast",
    recommended: true,
    popularity: 90,
  },
  {
    id: "alfred",
    name: "Alfred",
    bundleIdPattern: "com.alfredapp.",
    category: "launcher",
    series: "other",
    description: "macOS 老牌效率启动器",
    installSource: { brew: "alfred", url: "https://www.alfredapp.com/" },
    iconKey: "alfred",
    recommended: false,
    popularity: 75,
  },
  {
    id: "notion",
    name: "Notion",
    bundleIdPattern: "notion.id",
    category: "utility",
    series: "other",
    description: "一站式笔记、文档、项目管理工具",
    installSource: { brew: "notion", url: "https://www.notion.so/" },
    iconKey: "notion",
    recommended: true,
    popularity: 90,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    bundleIdPattern: "md.obsidian",
    category: "utility",
    series: "other",
    description: "本地优先的知识管理和笔记应用",
    installSource: { brew: "obsidian", url: "https://obsidian.md/" },
    iconKey: "obsidian",
    recommended: true,
    popularity: 85,
  },
  {
    id: "wps",
    name: "WPS Office",
    bundleIdPattern: "com.kingsoft.wpsoffice",
    category: "utility",
    series: "other",
    description: "金山办公套件，兼容 Microsoft Office",
    installSource: { brew: "wpsoffice", url: "https://www.wps.com/" },
    iconKey: "wps",
    recommended: false,
    popularity: 70,
  },
  {
    id: "baidunetdisk",
    name: "百度网盘",
    bundleIdPattern: "com.baidu.netdisk",
    category: "utility",
    series: "baidu",
    description: "百度网盘桌面客户端",
    installSource: { brew: "baidunetdisk", url: "https://pan.baidu.com/" },
    iconKey: "baidunetdisk",
    recommended: false,
    popularity: 80,
  },
  {
    id: "xmind",
    name: "XMind",
    bundleIdPattern: "net.xmind.",
    category: "utility",
    series: "other",
    description: "专业思维导图工具",
    installSource: { brew: "xmind", url: "https://xmind.app/" },
    iconKey: "xmind",
    recommended: false,
    popularity: 55,
  },
  {
    id: "keka",
    name: "Keka",
    bundleIdPattern: "com.keka.keka",
    category: "utility",
    series: "other",
    description: "macOS 压缩解压工具",
    installSource: { brew: "keka", url: "https://www.keka.io/" },
    iconKey: "keka",
    recommended: false,
    popularity: 65,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    bundleIdPattern: "com.deepseek.",
    category: "ai",
    series: "other",
    description: "DeepSeek AI 助手",
    installSource: { url: "https://chat.deepseek.com/" },
    iconKey: "deepseek",
    recommended: false,
    popularity: 60,
  },
];

type InstalledAppFingerprint = Pick<AppInfo, "appId" | "name" | "bundleId" | "sourceId" | "version" | "installPath">;

function normalizeId(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizeName(value: string | undefined): string {
  return normalizeId(value)
    .replace(/\.app$/, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function splitPatterns(value: string): string[] {
  return value
    .split(",")
    .map((item) => normalizeId(item))
    .filter(Boolean);
}

function looseNameMatch(expected: string, actual: string): boolean {
  if (!expected || !actual) return false;
  if (expected === actual) return true;
  return Math.min(expected.length, actual.length) >= 4 && (
    expected.includes(actual) || actual.includes(expected)
  );
}

function findInstalledMatch(
  recommendedApp: RecommendedApp,
  installedApps: InstalledAppFingerprint[]
): InstalledAppFingerprint | undefined {
  const bundlePatterns = splitPatterns(recommendedApp.bundleIdPattern);
  const sourcePatterns = [
    recommendedApp.installSource.brew,
    recommendedApp.installSource.winget,
    recommendedApp.installSource.apt,
    recommendedApp.installSource.flatpak,
    recommendedApp.installSource.snap,
  ].map(normalizeId).filter(Boolean);
  const namePatterns = [
    recommendedApp.name,
    recommendedApp.id,
    recommendedApp.iconKey,
  ].map(normalizeName).filter(Boolean);

  return installedApps.find((installedApp) => {
    const installedBundleId = normalizeId(installedApp.bundleId);
    if (installedBundleId && installedBundleId !== "unknown") {
      const matchedByBundle = bundlePatterns.some((pattern) =>
        installedBundleId === pattern || installedBundleId.includes(pattern)
      );
      if (matchedByBundle) return true;
    }

    const installedSourceId = normalizeId(installedApp.sourceId);
    if (installedSourceId) {
      const matchedBySource = sourcePatterns.some((pattern) =>
        installedSourceId === pattern ||
        installedSourceId.includes(pattern) ||
        pattern.includes(installedSourceId)
      );
      if (matchedBySource) return true;
    }

    const installedName = normalizeName(installedApp.name);
    return namePatterns.some((pattern) => looseNameMatch(pattern, installedName));
  });
}

export function getRecommendedInstallList(
  installedApps: InstalledAppFingerprint[]
): RecommendedAppInstallStatus[] {
  return RECOMMENDED_APPS.map((app) => {
    const installedApp = findInstalledMatch(app, installedApps);
    return {
      ...app,
      installed: Boolean(installedApp),
      installedAppId: installedApp?.appId,
      installedVersion: installedApp?.version,
      installedPath: installedApp?.installPath,
    };
  });
}

export function getUninstalledRecommended(
  installedBundleIds: string[],
  installedNames: string[],
  installedSourceIds: string[] = []
): RecommendedApp[] {
  const installedApps = installedBundleIds.map((bundleId, index) => ({
    appId: "",
    bundleId,
    name: installedNames[index] ?? "",
    sourceId: installedSourceIds[index] ?? "",
    version: "",
    installPath: "",
  }));

  return getRecommendedInstallList(installedApps)
    .filter((app) => !app.installed)
    .map((app) => {
      const { installed, installedAppId, installedVersion, installedPath, ...recommendedApp } = app;
      void installed;
      void installedAppId;
      void installedVersion;
      void installedPath;
      return recommendedApp;
    });
}

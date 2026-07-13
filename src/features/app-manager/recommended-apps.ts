/**
 * Feature / 功能层: stay within this feature; 只处理当前功能.
 */
import type { AppCategoryKey } from "@/features/app-manager/app-categories"
import type { AppSeriesKey } from "@/features/app-manager/app-series"
import type { AppInfo } from "@/lib/tauri/types"

export interface RecommendedApp {
  id: string
  name: string
  bundleIdPattern: string
  category: AppCategoryKey
  series: AppSeriesKey
  description: string
  installSource: {
    brew?: string
    winget?: string
    apt?: string
    flatpak?: string
    snap?: string
    url?: string
  }
  iconKey: string
  recommended: boolean
  popularity?: number
}

export interface RecommendedAppInstallStatus extends RecommendedApp {
  installed: boolean
  installedAppId?: string
  installedVersion?: string
  installedPath?: string
  installedCanUninstall?: boolean
}

export const RECOMMENDED_APPS: RecommendedApp[] = [
  {
    id: "google-chrome",
    name: "Google Chrome",
    bundleIdPattern: "com.google.chrome",
    category: "browser",
    series: "google",
    description: "Cross-platform web browser by Google",
    installSource: {
      brew: "google-chrome",
      winget: "Google.Chrome",
      flatpak: "com.google.Chrome",
      url: "https://www.google.com/chrome/",
    },
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
    description: "Open-source browser focused on privacy",
    installSource: {
      brew: "firefox",
      winget: "Mozilla.Firefox",
      flatpak: "org.mozilla.firefox",
      snap: "firefox",
      url: "https://www.mozilla.org/firefox/",
    },
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
    description: "Innovative modern browser",
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
    description: "Instant messaging app by Tencent",
    installSource: { winget: "Tencent.WeChat", url: "https://mac.weixin.qq.com/" },
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
    description: "Tencent instant messaging software",
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
    description: "Enterprise collaboration platform by Alibaba",
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
    description: "All-in-one enterprise collaboration platform by ByteDance",
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
    description: "Team communication and collaboration platform",
    installSource: {
      brew: "slack",
      winget: "SlackTechnologies.Slack",
      flatpak: "com.slack.Slack",
      snap: "slack",
      url: "https://slack.com/downloads",
    },
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
    description: "Cross-platform messaging focused on speed and security",
    installSource: {
      brew: "telegram",
      winget: "Telegram.TelegramDesktop",
      url: "https://desktop.telegram.org/",
    },
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
    description: "Voice chat platform for gamers and communities",
    installSource: {
      brew: "discord",
      winget: "Discord.Discord",
      flatpak: "com.discordapp.Discord",
      snap: "discord",
      url: "https://discord.com/download",
    },
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
    description: "Video conferencing software",
    installSource: {
      brew: "zoom",
      winget: "Zoom.Zoom",
      flatpak: "us.zoom.Zoom",
      url: "https://www.zoom.com/download",
    },
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
    description: "Lightweight yet powerful code editor by Microsoft",
    installSource: {
      brew: "visual-studio-code",
      winget: "Microsoft.VisualStudioCode",
      apt: "code",
      snap: "code",
      flatpak: "com.visualstudio.code",
      url: "https://code.visualstudio.com/download",
    },
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
    description: "Java IDE by JetBrains",
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
    description: "AI-first code editor",
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
    description: "AI-powered IDE",
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
    description: "High-performance code editor written in Rust",
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
    description: "Blazing fast lightweight text editor",
    installSource: {
      brew: "sublime-text",
      winget: "SublimeHQ.SublimeText",
      url: "https://www.sublimetext.com/download",
    },
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
    description: "Official desktop client by OpenAI",
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
    description: "Desktop AI assistant by Anthropic",
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
    description: "Run LLMs locally with ease",
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
    description: "Containerized application development platform",
    installSource: {
      brew: "docker",
      winget: "Docker.DockerDesktop",
      url: "https://www.docker.com/products/docker-desktop/",
    },
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
    description: "Lightweight Docker alternative for macOS",
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
    description: "Collaborative UI/UX design tool",
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
    description: "API development and testing tool",
    installSource: {
      brew: "postman",
      winget: "Postman.Postman",
      snap: "postman",
      url: "https://www.postman.com/downloads/",
    },
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
    description: "Powerful terminal emulator replacement for macOS",
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
    description: "Modern terminal written in Rust",
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
    description: "All-in-one API design, debugging, and documentation platform",
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
    description: "Productivity launcher, a powerful Spotlight alternative",
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
    description: "Veteran productivity launcher for macOS",
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
    description: "All-in-one notes, docs, and project management tool",
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
    description: "Local-first knowledge management and note-taking app",
    installSource: {
      brew: "obsidian",
      winget: "Obsidian.Obsidian",
      flatpak: "md.obsidian.Obsidian",
      snap: "obsidian",
      url: "https://obsidian.md/",
    },
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
    description: "Office suite by Kingsoft, compatible with Microsoft Office",
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
    description: "Baidu Netdisk desktop client",
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
    description: "Professional mind mapping tool",
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
    description: "macOS compression and decompression tool",
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
    description: "DeepSeek AI assistant",
    installSource: { url: "https://chat.deepseek.com/" },
    iconKey: "deepseek",
    recommended: false,
    popularity: 60,
  },
]

type InstalledAppFingerprint = Pick<
  AppInfo,
  "appId" | "name" | "bundleId" | "sourceId" | "version" | "installPath"
> & { allowedActions?: AppInfo["allowedActions"] }

function normalizeId(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase()
}

function normalizeName(value: string | undefined): string {
  return normalizeId(value)
    .replace(/\.app$/, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "")
}

function splitPatterns(value: string): string[] {
  return value
    .split(",")
    .map((item) => normalizeId(item))
    .filter(Boolean)
}

function findInstalledMatch(
  recommendedApp: RecommendedApp,
  installedApps: InstalledAppFingerprint[],
): { app: InstalledAppFingerprint; exact: boolean } | undefined {
  const bundlePatterns = splitPatterns(recommendedApp.bundleIdPattern)
  const sourcePatterns = [
    recommendedApp.installSource.brew,
    recommendedApp.installSource.winget,
    recommendedApp.installSource.apt,
    recommendedApp.installSource.flatpak,
    recommendedApp.installSource.snap,
  ]
    .map(normalizeId)
    .filter(Boolean)
  const namePatterns = [recommendedApp.name, recommendedApp.id, recommendedApp.iconKey]
    .map(normalizeName)
    .filter(Boolean)

  for (const installedApp of installedApps) {
    const installedBundleId = normalizeId(installedApp.bundleId)
    if (installedBundleId && installedBundleId !== "unknown") {
      const matchedByBundle = bundlePatterns.some((pattern) => installedBundleId === pattern)
      if (matchedByBundle) return { app: installedApp, exact: true }
    }

    const installedSourceId = normalizeId(installedApp.sourceId)
    if (installedSourceId) {
      const matchedBySource = sourcePatterns.some((pattern) => installedSourceId === pattern)
      if (matchedBySource) return { app: installedApp, exact: true }
    }

    const installedName = normalizeName(installedApp.name)
    // Exact normalized display names are safe for the non-destructive
    // "installed" badge. Destructive actions remain gated by allowedActions.
    if (namePatterns.some((pattern) => pattern === installedName)) {
      return { app: installedApp, exact: false }
    }
  }
  return undefined
}

export function getRecommendedInstallList(
  installedApps: InstalledAppFingerprint[],
): RecommendedAppInstallStatus[] {
  return RECOMMENDED_APPS.map((app) => {
    const match = findInstalledMatch(app, installedApps)
    const installedApp = match?.app
    return {
      ...app,
      installed: Boolean(installedApp),
      installedAppId: match?.exact ? installedApp?.appId : undefined,
      installedVersion: installedApp?.version,
      installedPath: installedApp?.installPath,
      installedCanUninstall: match?.exact
        ? (installedApp?.allowedActions?.uninstall ?? false)
        : false,
    }
  })
}

export function getUninstalledRecommended(
  installedBundleIds: string[],
  installedNames: string[],
  installedSourceIds: string[] = [],
): RecommendedApp[] {
  const installedApps = installedBundleIds.map((bundleId, index) => ({
    appId: "",
    bundleId,
    name: installedNames[index] ?? "",
    sourceId: installedSourceIds[index] ?? "",
    version: "",
    installPath: "",
  }))

  return getRecommendedInstallList(installedApps)
    .filter((app) => !app.installed)
    .map((app) => {
      const { installed, installedAppId, installedVersion, installedPath, ...recommendedApp } = app
      void installed
      void installedAppId
      void installedVersion
      void installedPath
      return recommendedApp
    })
}

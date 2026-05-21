# 一键装机功能实现方案 (方案 C)

## 概述

在类型筛选中新增"未安装"选项，点击后内容区切换到专用推荐卡片布局，展示预定义推荐列表中未被安装的应用，提供一键安装能力。

---

## 1. 推荐应用数据模型

新建 `src/features/app-manager/recommended-apps.ts`：

```typescript
import type { AppCategoryKey } from "@/features/app-manager/app-categories";
import type { AppSeriesKey } from "@/features/app-manager/app-series";

/**
 * 推荐应用定义（预装清单）
 */
export interface RecommendedApp {
  /** 唯一标识,如 "google-chrome" */
  id: string;
  /** 应用名称 */
  name: string;
  /** bundleId 匹配模式,用于判断是否已安装 (支持逗号分隔多个) */
  bundleIdPattern: string;
  /** 所属分类 */
  category: AppCategoryKey;
  /** 所属厂商系列 */
  series: AppSeriesKey;
  /** 简要描述 */
  description: string;
  /** 安装方式 */
  installSource: {
    /** macOS: brew cask name */
    brew?: string;
    /** Windows: winget package id */
    winget?: string;
    /** Linux: apt package name */
    apt?: string;
    /** Linux: flatpak id */
    flatpak?: string;
    /** Linux: snap name */
    snap?: string;
    /** 兜底: 下载页面 URL */
    url?: string;
  };
  /** 图标标识,用于在前端匹配同款内置图标 */
  iconKey: string;
  /** 是否推荐安装（用于排序） */
  recommended: boolean;
  /** 安装量/人气（用于排序） */
  popularity?: number;
}

// ============================================================================
// 推荐应用列表
// ============================================================================

export const RECOMMENDED_APPS: RecommendedApp[] = [
  // --- 浏览器 ---
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
    installSource: { brew: "arc", url: "https://arc.net/" },
    iconKey: "arc",
    recommended: false,
    popularity: 70,
  },

  // --- 通讯 ---
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
    installSource: { brew: "slack", winget: "SlackTechnologies.Slack", url: "https://slack.com/" },
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
    installSource: { brew: "discord", winget: "Discord.Discord", url: "https://discord.com/" },
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
    installSource: { brew: "zoom", winget: "Zoom.Zoom", url: "https://zoom.us/" },
    iconKey: "zoom",
    recommended: false,
    popularity: 50,
  },

  // --- IDE / 编辑器 ---
  {
    id: "vscode",
    name: "Visual Studio Code",
    bundleIdPattern: "com.microsoft.vscode",
    category: "ide",
    series: "microsoft",
    description: "微软出品,轻量级但功能强大的代码编辑器",
    installSource: { brew: "visual-studio-code", winget: "Microsoft.VisualStudioCode", url: "https://code.visualstudio.com/" },
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
    installSource: { brew: "intellij-idea", url: "https://www.jetbrains.com/idea/" },
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
    installSource: { brew: "cursor", url: "https://cursor.sh/" },
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
    installSource: { url: "https://codeium.com/windsurf" },
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
    installSource: { brew: "sublime-text", winget: "SublimeHQ.SublimeText", url: "https://www.sublimetext.com/" },
    iconKey: "sublime",
    recommended: false,
    popularity: 45,
  },

  // --- AI ---
  {
    id: "chatgpt",
    name: "ChatGPT",
    bundleIdPattern: "com.openai.chat",
    category: "ai",
    series: "openai",
    description: "OpenAI 官方桌面客户端",
    installSource: { url: "https://chatgpt.com/" },
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
    installSource: { url: "https://claude.ai/" },
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
    installSource: { brew: "ollama", url: "https://ollama.ai/" },
    iconKey: "ollama",
    recommended: true,
    popularity: 75,
  },

  // --- 开发工具 ---
  {
    id: "docker",
    name: "Docker",
    bundleIdPattern: "com.docker.docker",
    category: "development",
    series: "other",
    description: "容器化应用开发平台",
    installSource: { brew: "docker", url: "https://www.docker.com/" },
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
    installSource: { brew: "figma", url: "https://www.figma.com/" },
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
    installSource: { brew: "postman", winget: "Postman.Postman", url: "https://www.postman.com/" },
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
    bundleIdPattern: "dev.warp.Warp",
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

  // --- 启动器 ---
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

  // --- 实用工具 ---
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

  // --- AI (更多) ---
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

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 根据已安装应用的 bundleId 列表,返回尚未安装的推荐应用
 */
export function getUninstalledRecommended(
  installedBundleIds: string[]
): RecommendedApp[] {
  const installed = new Set(
    installedBundleIds.map((id) => id.toLowerCase())
  );

  return RECOMMENDED_APPS.filter((app) => {
    const patterns = app.bundleIdPattern.split(",").map((p) => p.trim().toLowerCase());
    // 只要匹配到任一 pattern,就认为已安装
    const isInstalled = patterns.some((pattern) =>
      installed.has(pattern) ||
      [...installed].some((installedId) => installedId.includes(pattern))
    );
    return !isInstalled;
  });
}
```

---

## 2. 类型系统变更

### 2.1 新增 UninstalledAppInfo 类型

`src/lib/tauri/types.ts` 新增:

```typescript
/** 虚拟的未安装应用条目（用于推荐安装列表） */
export interface UninstalledAppInfo {
  /** 标记这是未安装条目 */
  _virtual: true;
  /** 推荐应用 id,如 "google-chrome" */
  id: string;
  /** 应用名称 */
  name: string;
  /** 按 bundleIdPattern 匹配 */
  bundleId: string;
  /** 分类 key */
  category: string;
  /** 厂商 key */
  series: string;
  /** 描述 */
  description: string;
  /** 安装源 */
  installSource: {
    brew?: string;
    winget?: string;
    apt?: string;
    flatpak?: string;
    snap?: string;
    url?: string;
  };
  /** 图标标识 */
  iconKey: string;
}

/** 内容视图可渲染的两种条目 */
export type AppManagerItem = AppInfo | UninstalledAppInfo;
```

### 2.2 AppFilterKey 新增 `"uninstalled"`

```typescript
// src/stores/app-manager.ts
export type AppFilterKey = "all" | "user" | "system" | "launchable" | "managed" | "upgradable" | "uninstalled";
```

### 2.3 Store 新增状态

```typescript
export interface AppManagerState {
  // ... 现有属性 ...

  /** 未安装的推荐应用列表（派生数据） */
  uninstalledApps: UninstalledAppInfo[];

  /** 单个安装操作状态 */
  installStates: Record<string, AppOperationState>;

  /** 安装确认弹窗 */
  installConfirmDialog: {
    open: boolean;
    appId: string;
    appName: string;
  };

  // 方法
  installApp: (appId: string) => Promise<void>;
  doBatchInstall: () => Promise<void>;
  refreshUninstalled: () => void;
}
```

---

## 3. 筛选逻辑变更

在 `AppManager.tsx` 的 `filteredApps` 计算逻辑中增加 `"uninstalled"` 分支:

```typescript
const filteredApps = useMemo(() => {
  // 当选中"未安装"时,不再过滤已安装 apps
  if (activeFilter === "uninstalled") {
    let result = uninstalledApps; // 来自 store

    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (app) =>
          app.name.toLowerCase().includes(q) ||
          app.description.toLowerCase().includes(q)
      );
    }

    // 分类/厂商过滤
    if (categoryFilter) {
      result = result.filter((app) => app.category === categoryFilter);
    }
    if (seriesFilter) {
      result = result.filter((app) => app.series === seriesFilter);
    }

    return result;
  }

  // 原有的已安装应用过滤逻辑不变
  return apps.filter((app) => {
    // ... 现有代码 ...
  });
}, [apps, searchQuery, activeFilter, categoryFilter, seriesFilter, uninstalledApps]);
```

---

## 4. 推荐应用专用内容组件

新建 `src/features/app-manager/RecommendedAppGrid.tsx`：

```tsx
import { useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Download, Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppIcon } from "@/components/features/AppIcon";
import type { UninstalledAppInfo } from "@/lib/tauri/types";

interface RecommendedAppGridProps {
  apps: UninstalledAppInfo[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  installStates: Record<string, { status: string }>;
  onInstall: (app: UninstalledAppInfo) => void;
}

export function RecommendedAppGrid({
  apps,
  searchQuery,
  onSearchChange,
  installStates,
  onInstall,
}: RecommendedAppGridProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* 搜索栏 */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("appManager.installSearchPlaceholder")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-8"
        />
      </div>

      {/* 结果统计 */}
      <p className="text-xs text-muted-foreground">
        {t("appManager.installCount", { count: apps.length })}
      </p>

      {/* 卡片网格 */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {apps.map((app) => {
            const state = installStates[app.id];
            const isInstalling = state?.status === "running";

            return (
              <Card key={app.id} className="p-4 hover:ring-1 hover:ring-primary/30 transition-all">
                <div className="flex items-start gap-3">
                  <AppIcon iconKey={app.iconKey} size={36} className="shrink-0 rounded-md" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate">{app.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {app.description}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {app.installSource.brew && (
                        <Badge variant="secondary" className="text-[10px] px-1">
                          🍺 Homebrew
                        </Badge>
                      )}
                      {app.installSource.winget && (
                        <Badge variant="secondary" className="text-[10px] px-1">
                          📦 winget
                        </Badge>
                      )}
                      {!app.installSource.brew && !app.installSource.winget && app.installSource.url && (
                        <Badge variant="secondary" className="text-[10px] px-1">
                          🌐 Download
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  className="w-full mt-3 h-8"
                  size="sm"
                  disabled={isInstalling}
                  onClick={() => onInstall(app)}
                >
                  {isInstalling ? (
                    <>
                      <RotateCcw size={13} className="mr-1 animate-spin" />
                      {t("appManager.installing")}
                    </>
                  ) : (
                    <>
                      <Download size={13} className="mr-1" />
                      {t("appManager.install")}
                    </>
                  )}
                </Button>
              </Card>
            );
          })}
        </div>
        {apps.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <Search size={32} className="opacity-30" />
            <p className="mt-2 text-sm">{t("appManager.installNoResults")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 5. AppManager.tsx 修改

关键变更点：

### 5.1 根据 `activeFilter` 切换内容视图

```typescript
// 在 ThreeColumnLayout 的 content 部分
content={
  activeFilter === "uninstalled" ? (
    <RecommendedAppGrid
      apps={filteredApps as UninstalledAppInfo[]}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      installStates={installStates}
      onInstall={handleInstall}
    />
  ) : (
    <ContentView
      data={filteredApps}
      // ... 现有 props ...
    />
  )
}
```

### 5.2 handleInstall 方法

```typescript
const handleInstall = useCallback(async (app: UninstalledAppInfo) => {
  setInstallState(app.id, "running", "Installing...");
  try {
    // 选择安装方式优先级: brew > winget > flatpak > snap > apt > url
    const result = await doInstallApp(app.id);
    setInstallState(app.id, result.success ? "success" : "error", result.message);
    if (result.success) {
      // 安装成功后重新扫描
      setTimeout(() => {
        scanApps();
        refreshUninstalled();
      }, 2000);
    }
  } catch (e) {
    setInstallState(app.id, "error", String(e));
  }
}, [setInstallState, scanApps, refreshUninstalled]);
```

### 5.3 类型筛选标签显示计数

```typescript
// APP_FILTER_OPTIONS 渲染处
{option.key === "uninstalled" && ` (${uninstalledApps.length})`}
```

---

## 6. 后端 install_app 命令

### 6.1 TypeScript 前端调用

`src/lib/tauri/commands.ts` 新增:

```typescript
export function installApp(appId: string) {
  return invoke<OperationResult>("install_app", { appId });
}

export function batchInstallApps(appIds: string[]) {
  return invoke<BatchOperationResult>("batch_install_apps", { appIds });
}
```

### 6.2 Rust 后端

`src-tauri/src/app_manager/mod.rs` 新增:

```rust
#[tauri::command]
pub fn install_app(
    app_id: String,
    state: tauri::State<'_, AppManagerState>,
) -> Result<OperationResult, String> {
    if is_macos() {
        macos::install_app(app_id, state.clone())
    } else if is_windows() {
        windows::install_app(app_id, state.clone())
    } else if is_linux() {
        linux::install_app(app_id, state.clone())
    } else {
        Err("Unsupported platform".into())
    }
}
```

`src-tauri/src/app_manager/macos.rs` 新增:

```rust
pub fn install_app(app_id: String, state: AppManagerState) -> Result<OperationResult, String> {
    // 从推荐列表中查安装方式
    // 优先使用 brew install --cask
    // 如果 brew 不可用,返回错误并提示打开 URL

    let brew_path = which_brew();
    let brew_available = brew_path.is_some();

    // 1. 通过 brew cask 安装
    if let Some(brew) = brew_path {
        let output = std::process::Command::new(&brew)
            .args(["install", "--cask", &app_id])
            .output()
            .map_err(|e| format!("Failed to execute brew: {}", e))?;

        let success = output.status.success();
        let message = String::from_utf8_lossy(if success { &output.stdout } else { &output.stderr }).to_string();

        let result = OperationResult {
            success,
            message: message.trim().to_string(),
            exit_code: output.status.code(),
            error_code: if success { None } else { Some("INSTALL_FAILED".into()) },
            permission_issue: message.contains("permission denied") || message.contains("root"),
        };

        record_operation(OperationRecord::new(
            "install", &app_id, &app_id, result.success, &result.message, result.exit_code,
        ));

        return Ok(result);
    }

    Err("No package manager available for installation".into())
}
```

`src-tauri/src/app_manager/windows.rs` 类似但使用 `winget install`。

在 `lib.rs` 中注册命令:

```rust
// src-tauri/src/lib.rs
#[tauri::command]
// ...
.invoke_handler(tauri::generate_handler![
    // ... 现有命令 ...
    app_manager::install_app,
    app_manager::batch_install_apps,
])
```

### 6.3 推荐应用安装源配置

需要在 Rust 端也维护一份推荐应用列表(或者从前端传递安装源信息)。

**推荐做法:** 从前端传递安装方式给后端:

```typescript
// 前端调用时,将安装源信息一并传给后端
export function installApp(appId: string, installSource: {
  brew?: string;
  winget?: string;
  // ...
}) {
  return invoke<OperationResult>("install_app", { appId, installSource });
}
```

Rust 端接收:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSource {
    pub brew: Option<String>,
    pub winget: Option<String>,
    pub flatpak: Option<String>,
    pub snap: Option<String>,
    pub apt: Option<String>,
    pub url: Option<String>,
}

#[tauri::command]
pub fn install_app(
    app_id: String,
    install_source: InstallSource,
) -> Result<OperationResult, String> {
    // ...
}
```

---

## 7. i18n 新增文案

### `src/i18n/locales/en.json`

```json
{
  "appManager": {
    "filterUninstalled": "Not Installed",
    "install": "Install",
    "installing": "Installing...",
    "installSearchPlaceholder": "Search recommended apps...",
    "installCount": "{{count}} apps available for install",
    "installNoResults": "No recommended apps match your search",
    "installSuccess": "Installed successfully",
    "installFailed": "Installation failed",
    "installConfirmTitle": "Install {{name}}",
    "installConfirmDescription": "This will download and install {{name}} on your system.",
    "confirmInstall": "Install",
    "batchInstall": "Install All",
    "batchInstallConfirmTitle": "Install {{count}} applications?",
    "batchInstallConfirmDescription": "This will download and install {{count}} applications on your system."
  }
}
```

### `src/i18n/locales/zh.json`

```json
{
  "appManager": {
    "filterUninstalled": "未安装",
    "install": "安装",
    "installing": "安装中...",
    "installSearchPlaceholder": "搜索推荐应用...",
    "installCount": "{{count}} 个应用可安装",
    "installNoResults": "没有匹配的推荐应用",
    "installSuccess": "安装成功",
    "installFailed": "安装失败",
    "installConfirmTitle": "安装 {{name}}",
    "installConfirmDescription": "将下载并安装 {{name}} 到您的系统。",
    "confirmInstall": "安装",
    "batchInstall": "一键安装全部",
    "batchInstallConfirmTitle": "安装 {{count}} 个应用？",
    "batchInstallConfirmDescription": "将下载并安装 {{count}} 个应用到您的系统。"
  }
}
```

---

## 8. 实现步骤(推荐顺序)

```
Step 1: 定义数据层
  - src/features/app-manager/recommended-apps.ts  ✓ 包含完整推荐列表

Step 2: 类型系统
  - types.ts → UninstalledAppInfo, AppManagerItem
  - store → AppFilterKey 增加 "uninstalled"

Step 3: Store 变更
  - 新增 uninstalledApps, installStates 等状态
  - 新增 installApp, refreshUninstalled 方法

Step 4: UI 组件
  - RecommendedAppGrid.tsx 卡片网格布局

Step 5: AppManager.tsx 集成
  - handleInstall 方法
  - 根据 activeFilter 切换 ContentView ↔ RecommendedAppGrid
  - 类型筛选显示计数

Step 6: i18n
  - en.json + zh.json 新增文案

Step 7: 后端
  - install_app command + 平台实现
  - 在 lib.rs 注册命令

Step 8: 后端(可选)
  - batch_install_apps 批量安装
```

---

## 9. 需要注意的细节

1. **安装后刷新:** install 成功后,自动调用 `scanApps()` 和 `refreshUninstalled()` 来更新状态
2. **打开 URL 兜底:** 当没有 brew/winget 可用时,可以调用 `tauri::api::shell::open` 打开下载页面
3. **安装进度反馈:** 对于 brew/winget 这类耗时较长的安装,建议在安装期间持续轮询或展示 loading spinner
4. **权限问题:** brew 需要 sudo; winget 一般不需要。需要在前端提示用户可能需要授权
5. **虚拟图标:** 对于推荐列表的图标,可以先使用 lucide-react 的 `Package` 图标作为占位,后续逐步替换为对应应用的 PNG/Base64

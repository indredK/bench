# 系统设置模块架构

> 2026-06-29

## 入口与层级

```
侧边栏
──────
📦 应用管理         — 独立功能页
✅ 硬件对比
📖 术语查询
💰 API 计费
🔧 开发工具箱      — 7 个子 Tab（端口管理/开发清理/环境检测/Token计算/开发工具/网络诊断/系统信息）
────────────────
⚙ 系统设置         — 3 个 Tab
  ├ 外观        — Dock、菜单栏、桌面、截图
  ├ 安全        — 防火墙、SSH、TCC 权限、锁屏
  └ 系统        — Finder、键盘、电源、登录项
```

**App 偏好**（主题/语言/窗口主题）通过 `SettingsDialog` 弹窗控制，入口为侧边栏底部 ⚙ 齿轮或 App 菜单 → Preferences。与系统设置分离——前者控制 Bench 自身，后者控制宿主 OS。

## 系统设置 3 个 Tab

| Tab | 职责 | 内容 |
|-----|------|------|
| 外观 | 用户可见的系统外观 | Display 电池百分比 / Dock 位置与自动隐藏 / 菜单栏自动隐藏 / 桌面图标 / 截图格式与保存位置 |
| 安全 | 安全与隐私控制 | 锁屏密码 / 防火墙 / SSH 远程登录 / 屏幕共享 / AirDrop / Gatekeeper / TCC 权限管理 / 麦克风静音 |
| 系统 | 系统行为控制 | Finder 配置（7项）/ 键盘 Fn 键 / 电源与低电量模式 / 屏保 / 登录项管理 / LaunchAgents & Daemons / 快捷操作（锁屏/关机/重启等，独立危险操作分区） |

数据类型 `SettingsTab = "appearance" | "security" | "system"`，定义在 `store.ts`。

## 开发工具箱

`features/dev-toolbox/` 收容 7 个开发工具为一个页面入口，每个工具作为子 Tab 渲染原有 feature 页面组件：

| 子 Tab | 渲染组件 | 来源 feature |
|--------|---------|-------------|
| 端口管理 | `<PortManager>` | `port-manager` |
| 开发清理 | `<DevCleaner>` | `dev-cleaner` |
| 环境检测 | `<EnvDetector>` | `env-detector` |
| Token 计算 | `<TokenCalculatorPage>` | `token-calculator` |
| 开发工具 | 内联实现 | JSON/Base64/Hash/UUID/Timestamp |
| 网络诊断 | 内联实现 | Ping/本地IP/WiFi |
| 系统信息 | `systemInfoUseCases` | system-info |

这些工具的 feature 路由仍注册在 `registry.tsx` 中（保证直接 URL 可达），但侧边栏导航通过 `TOOLBOX_FEATURE_IDS` 集合过滤，只显示「开发工具箱」一条。

## 前端文件结构

```
src/
├── App.tsx                          # 壳层：路由 + SettingsDialog + AboutDialog
├── features/
│   ├── types.ts                     # AppFeature / NavigationItem 接口
│   ├── registry.tsx                 # 路由注册 + 导航生成
│   ├── system-settings/
│   │   ├── feature.tsx              # 路由元数据
│   │   ├── page.tsx                 # 3 Tab 主页面
│   │   ├── store.ts                 # Zustand 状态
│   │   ├── useSettingAction.ts      # 统一异步操作包装
│   │   ├── components/
│   │   │   └── sections/            # SleepSection / KeyboardSection / ...
│   │   └── services/
│   │       ├── system-settings.use-cases.ts
│   │       ├── system-settings.repository.ts
│   │       ├── system-info.use-cases.ts
│   │       └── system-info.repository.ts
│   └── dev-toolbox/
│       ├── feature.tsx              # 路由元数据
│       └── page.tsx                 # 7 子 Tab 入口
├── components/
│   ├── ui/                          # shadcn 组件 + 跨功能共享组件
│   │   └── setting-group.tsx        # ← 从 system-settings 上提的共享组件
│   ├── layout/
│   │   └── Sidebar.tsx              # 侧边栏：功能导航 + 配置区 + 快捷操作
│   └── common/
│       └── SettingsDialog.tsx       # App 偏好：主题/语言/窗口主题
└── i18n/
    └── locales/
        ├── en.json
        └── zh.json
```

## 状态管理

`store.ts` 使用 Zustand，字段按 Tab 分组：

```
activeTab: SettingsTab
loadedTabs: Set<string>           # 已加载的 Tab 缓存

── 外观 ──
displayBatteryPercent, dockOrientation, autohideDock, autohideMenuBar,
dockShowRecents, hideDesktopIcons, smallLaunchpadIcon, screenSaver,
screenshotFormat, screenshotDisableShadow, screenshotShowThumbnail, screenshotSaveLocation

── 安全 ──
lockScreenPassword, lockScreenPasswordDelay,
networkFirewall, networkSsh, networkScreenSharing, networkAirdropDisabled,
gatekeeper, muteMic

── 系统 ──
sleepState, keyboardFnKey, lowPowerMode,
finderShowHiddenFiles, finderShowPathbar, finderShowStatusbar,
finderShowLibraryDir, finderShowFileExtensions,
finderSpotlightExternalDisk, finderNoDsStore,
loginItems, defaultBrowser

── 共享 ──
loading: boolean
applyingKeys: Set<string>         # 按 key 精细化 loading（每个开关独立转圈）
```

`useSettingAction.run(key, action)` 包装所有写操作，提供并发保护 + toast 反馈。

## 后端模块结构

`src-tauri/src/` 按领域拆分：

| 模块 | 文件 | 描述 |
|------|------|------|
| system_settings | finder/dock/keyboard/display/network/screenshot/privacy/login_items/quick_actions/dev_tools/system_toggles/system_info + helpers/types | macOS 系统偏好控制（defaults/pmset/osascript/TCC） |
| port_manager | commands/processes/fingerprints/types | 端口扫描与进程管理 |
| dev_cleaner | commands/cleanup/scanner/rules/safe_delete/custom_cleanup/projects/sizing/types | 开发项目清理 |
| env_detector | commands/inventory/paths/version/classification/command_files/node_bins/types | 开发环境检测 |
| token_calculator | commands/storage/state/types | Token 计算与定价 |
| account_manager | commands/crypto/detection/probe/storage/state/webview/types | 账号管理（站点/凭据/登录跳转） |
| app_manager | commands/operations/domain/state/types + installer/ + sources/ | 应用管理与更新 |
| app_updater | commands/state/types | Bench 自身更新 |
| sleep_inhibitor | commands/types | 休眠抑制器 |
| window_theme | commands | 窗口主题 |
| terminology | commands/data/state/storage/types | 术语查询 |

命令注册入口 `commands.rs`（`app_invoke_handler!` 宏）。所有模块使用 `commands.rs` / `types.rs` 命名，阻塞 I/O 通过 `spawn_blocking` 隔离，错误在 IPC 边界归一为 `Result<T, String>`。

## 组件放置规则

| 范围 | 位置 |
|------|------|
| 跨功能共享基础组件 | `components/ui/` |
| 壳层布局 | `components/layout/` |
| 跨功能共享逻辑 | `shared/` |
| 单功能内部组件 | feature 内 `components/` |
| 纯工具函数 | `lib/` |
| 平台能力封装 | `platform/` |

`SettingGroup` 在 system-settings 和 dev-toolbox 两个 feature 使用后，已从 `system-settings/components/` 上提到 `components/ui/`。

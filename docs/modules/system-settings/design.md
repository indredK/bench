# System Settings 技术设计

> 视角：技术 / 实现。产品功能见 [features.md](./features.md)；迭代规划见 [roadmap.md](./roadmap.md)。

## 目录

1. [模块架构](#1-模块架构)
2. [前端组件结构](#2-前端组件结构)
3. [后端模块结构](#3-后端模块结构)
4. [状态管理](#4-状态管理)
5. [Select 组件迁移](#5-select-组件迁移)
6. [设置搜索索引](#6-设置搜索索引)
7. [设计规范：四维约束](#7-设计规范四维约束)
8. [defaults 键位映射](#8-defaults-键位映射)
9. [排查方法论](#9-排查方法论)
10. [组件放置规则](#10-组件放置规则)
11. [功能审计报告](#11-功能审计报告)

---

## 1. 模块架构

### 1.1 入口与层级

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

### 1.2 前端文件结构

```
src/
├── App.tsx                          # 壳层：路由 + SettingsDialog + AboutDialog
├── features/
│   ├── types.ts                     # AppFeature / NavigationItem 接口
│   ├── registry.tsx                 # 路由注册 + 导航生成
│   ├── system-settings/
│   │   ├── feature.tsx              # 路由元数据
│   │   ├── page.tsx                 # 3 Tab 主页面 + 搜索栏
│   │   ├── store.ts                 # Zustand 状态
│   │   ├── useSettingAction.ts      # 统一异步操作包装
│   │   ├── search-index.ts          # 搜索索引（~50 条目）
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
│   │   ├── select.tsx               # shadcn Select（popper position mode）
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

---

## 2. 前端组件结构

### 2.1 page.tsx 主页面

```tsx
export function SystemSettingsPage() {
  const { activeTab, searchQuery } = useSystemSettingsStore();

  return (
    <div>
      <SearchBar />
      {searchQuery ? (
        <SearchResults />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="appearance"><AppearanceSection /></TabsContent>
          <TabsContent value="security"><SecuritySection /></TabsContent>
          <TabsContent value="system"><SystemSection /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
```

### 2.2 Section 组件

每个 Section 由多个 `SettingGroup` 组成，每个 `SettingGroup` 内含开关、滑块、下拉等：

```tsx
<SettingGroup title={t("systemSettings.keyboard.title")}>
  <div className="flex items-center justify-between py-2">
    <span>{t("systemSettings.keyboard.textSubstitution")}</span>
    <Switch checked={textSubstitution} onCheckedChange={...} />
  </div>
</SettingGroup>
```

### 2.3 Section 列表

| Tab | Sections |
|-----|---------|
| 外观 | DisplayBatterySection / DisplayDockSection / DisplayMenuBarSection / DisplayDesktopSection / ScreenshotSection |
| 安全 | LockScreenSection / NetworkFirewallSection / NetworkServicesSection / GatekeeperSection / TccPermissionsSection / MuteMicSection |
| 系统 | FinderSection / KeyboardSection / PowerSection / ScreenSaverSection / LoginItemsSection / LaunchAgentsSection / QuickActionsSection |

---

## 3. 后端模块结构

`src-tauri/src/system_settings/` 按领域拆分：

| 模块 | 文件 | 描述 |
|------|------|------|
| finder | finder.rs | Finder 配置（隐藏文件 / 路径栏 / Library 等） |
| dock | dock.rs | Dock 配置（位置 / 自动隐藏 / 最小化动画 scale） |
| keyboard | keyboard.rs | 键盘配置（Fn 键 / 文本替换 / 重复速率） |
| display | display.rs | 显示配置（电池百分比 / 桌面图标） |
| network | network.rs | 网络配置（防火墙 / SSH / 屏幕共享 / AirDrop） |
| screenshot | screenshot.rs | 截图配置（格式 / 阴影 / 缩略图 / 保存位置） |
| privacy | privacy.rs | TCC 权限管理 |
| login_items | login_items.rs | 登录项管理 |
| launch_agents | launch_agents.rs | LaunchAgents / LaunchDaemons |
| quick_actions | quick_actions.rs | 快捷操作（锁屏 / 关机 / 重启等） |
| dev_tools | dev_tools.rs | 开发工具配置 |
| system_toggles | system_toggles.rs | 系统开关（菜单栏 / 桌面等） |
| system_info | system_info.rs | 系统信息（macOS 版本 / 主机名等） |
| helpers | helpers.rs | defaults_read/write / shell_escape / sudo_cmd |
| types | types.rs | 数据模型 |

命令注册入口 `commands.rs`（`app_invoke_handler!` 宏）。所有模块使用 `commands.rs` / `types.rs` 命名，阻塞 I/O 通过 `spawn_blocking` 隔离，错误在 IPC 边界归一为 `Result<T, String>`。

---

## 4. 状态管理

`store.ts` 使用 Zustand，字段按 Tab 分组：

```typescript
interface SystemSettingsState {
  activeTab: SettingsTab;             // "appearance" | "security" | "system"
  loadedTabs: Set<string>;            // 已加载的 Tab 缓存
  searchQuery: string;                // 搜索查询

  // ── 外观 ──
  displayBatteryPercent, dockOrientation, autohideDock, autohideMenuBar,
  dockShowRecents, hideDesktopIcons, smallLaunchpadIcon, screenSaver,
  screenshotFormat, screenshotDisableShadow, screenshotShowThumbnail, screenshotSaveLocation,

  // ── 安全 ──
  lockScreenPassword, lockScreenPasswordDelay,
  networkFirewall, networkSsh, networkScreenSharing, networkAirdropDisabled,
  gatekeeper, muteMic,

  // ── 系统 ──
  sleepState, keyboardFnKey, lowPowerMode,
  finderShowHiddenFiles, finderShowPathbar, finderShowStatusbar,
  finderShowLibraryDir, finderShowFileExtensions,
  finderSpotlightExternalDisk, finderNoDsStore,
  loginItems, defaultBrowser,

  // ── 共享 ──
  loading: boolean,
  applyingKeys: Set<string>,         // 按 key 精细化 loading（每个开关独立转圈）
}
```

### 4.1 useSettingAction

```typescript
const { run } = useSettingAction();

onCheckedChange={async (v) => {
  await run(async () => {
    await systemSettingsUseCases.setXxx(v);
    store.setXxx(v);
  });
}}
```

- `run(key, action)` 包装所有写操作
- 提供并发保护：applying 期间设置 `applying=true` 阻塞并发
- 提供 toast 反馈：loading / success / error
- `applyingKeys: Set<string>` 实现按 key 精细化 loading

---

## 5. Select 组件迁移

v1.16 完成：从原生 `<select>` 迁移到 shadcn `<Select>`。

### 5.1 共享 Select 配置（select.tsx）

`SelectContent` 默认使用 `position="popper"` + `align="start"`，并强制宽度约束：

```tsx
<SelectContent
  position="popper"
  align="start"
  className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]"
>
  {items.map(item => (
    <SelectItem key={item.value} value={item.value}>
      <span className="min-w-0 truncate">{item.label}</span>
    </SelectItem>
  ))}
</SelectContent>
```

### 5.2 关键决策

**为何用 `position="popper"` 而非 `position="item-aligned"`**：

- `item-aligned` 模式下 Radix UI 用 JS 设置 panel 宽度为最宽选项的宽度，会**覆盖** CSS `max-w`
- `popper` 模式下 panel 宽度可通过 CSS 自由控制，配合 `--radix-select-trigger-width` 让 panel 与 trigger 同宽

**为何用 `w-[var(--radix-select-trigger-width)]`**：

- 业务侧 trigger 普遍用 `w-full`，希望 panel 与 trigger 同宽避免溢出
- `max-w-[calc(100vw-2rem)]` 防止 panel 超出视口

**为何 `SelectItem` 内文本加 `min-w-0 truncate`**：

- `min-w-0` 让 flex 子元素可以收缩到内容宽度以下
- `truncate` 在溢出时显示省略号

### 5.3 影响范围

该默认配置影响所有 11 个全局 `SelectContent` 实例。业务侧无需再单独配置 `SelectContent` props，避免每处重复设置导致的遗漏。

---

## 6. 设置搜索索引

### 6.1 search-index.ts 结构

```typescript
interface SearchEntry {
  key: string;          // i18n key 后缀，如 "keyboard.textSubstitution"
  tab: SettingsTab;     // "appearance" | "security" | "system"
  section: string;      // section id，用于滚动定位
}

export const SEARCH_INDEX: SearchEntry[] = [
  { key: "appearance.batteryPercent", tab: "appearance", section: "display-battery" },
  { key: "appearance.dockOrientation", tab: "appearance", section: "display-dock" },
  // ... ~50 条目
];
```

### 6.2 搜索流程

```typescript
// page.tsx
const searchResults = useMemo(() => {
  if (!searchQuery.trim()) return [];
  const q = searchQuery.toLowerCase();
  return SEARCH_INDEX.filter(entry => {
    const label = t(`systemSettings.${entry.key}`);
    return label.toLowerCase().includes(q);
  });
}, [searchQuery, t]);
```

### 6.3 搜索结果展示

- 输入时实时过滤
- 隐藏 Tab 栏，仅显示结果列表
- 每项结果展示：标签 + Tab 徽章
- 点击结果：切换 Tab + 滚动到 Section + 清空搜索

### 6.4 设计原则

- **复用现有 i18n 翻译**：不维护独立的搜索文案
- **中英双语支持**：基于当前 locale 的 `t()` 输出匹配
- **零运行时开销**：索引为静态数组，启动时加载

---

## 7. 设计规范：四维约束

模块在四个维度上建立约束标准，作为功能开发、代码评审与回归审计的统一依据。

### 7.1 隐私保护（P）

| 编号 | 规则 | 级别 |
|------|------|------|
| P-1 | 禁止主动外发用户数据；所有网络诊断目标地址由用户显式输入 | 必须 |
| P-2 | 外部 IP 查询须显式同意；本地可推导方式优先 | 必须 |
| P-3 | 敏感信息读取需说明用途，不回传无关字段 | 必须 |
| P-4 | TCC.db 访问失败须可识别，返回明确错误而非空列表 | 必须 |
| P-5 | 不持久化用户敏感数据；仅读写系统 defaults | 必须 |

### 7.2 授权机制（A）

| 编号 | 规则 | 级别 |
|------|------|------|
| A-1 | 输入白名单校验，防 flag 注入 | 必须 |
| A-2 | 写操作与读操作校验对齐 | 必须 |
| A-3 | sudo 操作经 GUI 授权（osascript），不静默 sudo | 必须 |
| A-4 | 路径校验，过滤 shell 元字符并 shell_escape | 必须 |
| A-5 | AppleScript 注入防护，escape_applescript 转义 | 必须 |
| A-6 | 权限分级：无权限 / 用户权限 / 管理员权限 | 建议 |

### 7.3 便利性（C）

| 编号 | 规则 | 级别 |
|------|------|------|
| C-1 | 统一 applying 管理（useSettingAction） | 必须 |
| C-2 | 设置后即时回读（refresh） | 必须 |
| C-3 | 窗口聚焦自动刷新 | 必须 |
| C-4 | 加载态可视化（Switch + Loader2Icon animate-spin + aria-busy + cursor-progress） | 必须 |
| C-5 | 危险操作二次确认（DestructiveConfirmDialog + callout），禁裸 window.confirm | 必须 |
| C-6 | defaults 类型正确（bool 用 -bool，int 用 -int，string 用 -string） | 必须 |

### 7.4 系统兼容性（S）

| 编号 | 规则 | 级别 |
|------|------|------|
| S-1 | 版本感知（macos_major_version 检测） | 必须 |
| S-2 | 菜单栏刷新双覆盖（SystemUIServer + ControlCenter）；Tahoe+ 额外 WindowManager | 必须 |
| S-3 | 非 macOS 平台优雅降级，返回明确错误不 panic | 必须 |
| S-4 | 命令拼接用参数数组，禁 bash -c 拼接 | 必须 |
| S-5 | defaults 键读取容错，键不存在返回默认值 | 必须 |
| S-6 | 前端能力探测（canUseDesktopFeatures / canUseTauriWindow） | 必须 |
| S-7 | ByHost 域用 -currentHost | 必须 |
| S-8 | 真实控制键须实证验证（见 §9 排查方法论） | 必须 |
| S-9 | cfprefsd 时序：先 kill 后写 | 必须 |
| S-10 | 状态记录键 vs 控制键须区分（如菜单栏自动隐藏） | 必须 |

### 7.5 异常处理

| 场景 | 处理方式 |
|------|----------|
| defaults 键不存在 | 返回合理默认值 |
| sudo 被用户取消 | 捕获 -128 / "User canceled"，友好错误 |
| TCC.db 无读取权限 | 返回 "Requires Full Disk Access" 明确提示 |
| 外部命令不存在 | 返回 "<cmd>: <error>" 格式错误 |
| 非 macOS 平台 | 返回 "only supported on macOS" |
| applying 期间重复触发 | useSettingAction.run 直接返回 undefined |
| 网络诊断超时 | curl --max-time 5 / nc -w 3 设置超时 |

---

## 8. defaults 键位映射

> 本节沉淀实测确认的 defaults 控制键，所有条目均经过「实证写入 → UI 生效」验证。

### 8.1 电池百分比显示

| macOS 版本 | 域 | 键 | 类型 | 值 | 刷新命令 |
|------------|----|----|------|----|---------|
| macOS 26 (Tahoe)+ | `ByHost/com.apple.controlcenter` | `Battery` | int | `2`=显示 / `8`=隐藏 | `killall ControlCenter` |
| macOS 25 及更早 | `com.apple.menuextra.battery` | `ShowPercent` | bool | `true` / `false` | `killall SystemUIServer` + `killall ControlCenter` |
| macOS 13 (Ventura)+ 备选 | `com.apple.controlcenter` | `BatteryShowPercentage` | bool | `true` / `false` | `killall ControlCenter` |

**Tahoe+ 实现要点**：
- 必须 `defaults -currentHost write com.apple.controlcenter Battery -int <2|8>`，普通 `defaults write` 无效（违反 S-7）
- 写入后 `killall ControlCenter` 立即生效
- 实现见 `display.rs` 与 `helpers.rs` 的 `defaults_read_current_host` / `defaults_write_current_host`

**Tahoe 上已确认的无效键**（系统不读取）：
- `NSGlobalDomain BatteryShowPercent`
- `com.apple.controlcenter BatteryShowPercentage`
- `com.apple.menuextra.battery ShowPercent`
- `com.apple.controlcenter "NSStatusItem VisibleCC Battery"` —— 状态记录键
- `com.apple.controlcenter "NSStatusItem Preferred Position Battery"` —— 仅记录菜单栏图标位置

### 8.2 菜单栏自动隐藏（四态）

实测验证日期：2026-06-28，macOS 26 (Tahoe)。

| 状态 | `AppleMenuBarVisibleInFullscreen` (NSGlobalDomain) | `_HIHideMenuBar` (NSGlobalDomain) | `AutoHideMenuBarOption` (com.apple.controlcenter) |
|------|------------------------------------------------------|------------------------------------|---------------------------------------------------|
| Never | `1` | `0` | `3` |
| In Full Screen Only | `0` | `0` | `2` |
| On Desktop Only | `1` | `1` | `1` |
| Always | `0` | `1` | `0` |

**三键职责分工**：
- `AppleMenuBarVisibleInFullscreen` + `_HIHideMenuBar`：**状态记录键**（非控制键）。Tahoe 上仅记录系统状态，`defaults write` 不触发行为变更
- `AutoHideMenuBarOption`：控制系统设置 UI 下拉框显示（UI 键），纯递减序列 `3→2→1→0`
- `com.apple.dock autohide-menubar`：四态下恒为 `0`，**非控制键**

**实现方式（必须用 System Events）**：

```applescript
tell application "System Events"
    tell dock preferences to set autohide menu bar to true  -- 隐藏菜单栏
end tell
```

参考 OnlySwitch 的 `AutoHideMenuBarCMD` 实现。需要 TCC **Automation 权限**（System Events）。

**写入后同步 UI 键**：通过 System Events 切换后，还需 `defaults write com.apple.controlcenter AutoHideMenuBarOption -int <n>` 同步 UI 键。

刷新（兜底）：`killall SystemUIServer`（旧版）+ `killall ControlCenter`（新版）+ `killall WindowManager`（Tahoe+）。

### 8.3 低电量模式（四态）

实测验证日期：2026-06-28，macOS 26 (Tahoe)。

| 选项 | `pmset -b lowpowermode` | `pmset -c lowpowermode` |
|------|-------------------------|-------------------------|
| 永不 (Never) | `0` | `0` |
| 始终 (Always) | `1` | `1` |
| 仅使用电池时 | `1` | `0` |
| 仅电源适配器时 | `0` | `1` |

**实现要点**：
- 读取：`pmset -g custom` 解析 Battery Power 与 AC Power 段的 `lowpowermode` 值
- 写入：需 sudo 权限（通过 `sudo_cmd` / osascript `with administrator privileges`）
- "仅使用电池时"与"仅电源适配器时"不能用 `pmset -a`，必须分别 `pmset -b` / `pmset -c`
- `lowpowermode=2` 返回 "HighPowerMode not supported on Battery Power"，确认只有 0/1 两个有效值

### 8.4 Gatekeeper（允许以下来源的应用程序）

排查日期：2026-06-28，macOS 26 (Tahoe)。

**读取**：`spctl -v --status` → 解析 `developer id enabled` / `developer id disabled`

**写入**：**无法从命令行控制**。实测验证：
- `spctl --disable-status` → "The option to globally disable the assessment system is currently not available in System Settings"
- `spctl --global-disable` → 同上
- `spctl --global-enable` → 无效果
- `defaults write` 各种键 → 域不存在或无效果
- `csrutil` → 只控制 SIP，不控制 Gatekeeper

**根因**：System Settings 通过私有 `SecurityPreferences` 框架控制（`spctl` 使用 `Security.framework` + `StorageKit.framework` 私有 API）。Apple 不提供公开 API，防止恶意软件绕过 Gatekeeper。

**结论**：此设置为**只读**显示当前状态。后续如 Apple 提供公开 API 可升级为可写。

### 8.5 键位映射维护规则

新增设置项时，须在此表追加条目并附实证验证记录（排查步骤或测试命令）。违反 S-8 的键不得入库。

---

## 9. 排查方法论

### 9.1 diff 两次 defaults 快照定位真实控制键

> 当某个 macOS 设置的 defaults 控制键不明确（官方文档缺失或旧文档与新版系统行为不一致）时，采用本节流程科学定位真实控制键。本方法在 macOS 26 (Tahoe) 电池百分比控制键排查中实战验证有效。

#### 9.1.1 流程

1. **基线快照**：dump 所有候选域的键值
   - 普通域：`defaults read <domain>`
   - ByHost 域：`defaults -currentHost read <domain>`（必须用 `-currentHost`，否则读不到）
   - 文件直读：`plutil -p ~/Library/Preferences/ByHost/<domain>.<UUID>.plist`

2. **切换状态**：用户手动在系统设置中切换目标开关（**不通过本应用**，避免应用写入干扰）

3. **二次快照**：dump 同样的域

4. **diff 对比**：`diff snapshot-baseline.txt snapshot-on.txt`，找出变化的键

5. **去伪存真**：对每个候选键执行三步验证
   - **去垃圾数据**：diff off vs on 无变化 → 应用历史写入的垃圾键，系统不读取
   - **去状态记录键**：删除该键 + 重启相关进程 → 系统自动重新写入 → 状态记录键，不是控制键
   - **实证写入**：用 `defaults write` 写入候选值 + 重启进程 → 用户确认 UI 生效 → 确认真实控制键

6. **必要时用 `find -newer <marker>` 辅助**：定位切换设置时被修改的文件，直接锁定 plist 路径，绕过候选域猜测

#### 9.1.2 命令模板

```bash
# 创建快照目录与 marker
mkdir -p /tmp/prefs-dump && touch /tmp/prefs-marker

# 基线快照（切换设置前）
{
  echo "=== NSGlobalDomain ==="
  defaults read NSGlobalDomain
  echo "=== com.apple.controlcenter ==="
  defaults read com.apple.controlcenter
  echo "=== ByHost com.apple.controlcenter ==="
  defaults -currentHost read com.apple.controlcenter
  echo "=== com.apple.menuextra.battery ==="
  defaults read com.apple.menuextra.battery
} > /tmp/prefs-dump/snapshot-baseline.txt

# 用户手动切换设置...

# 二次快照（切换后）
{ ...同上... } > /tmp/prefs-dump/snapshot-on.txt

# diff
diff /tmp/prefs-dump/snapshot-baseline.txt /tmp/prefs-dump/snapshot-on.txt

# 用 find 定位被修改的 plist（绕过候选域猜测）
find ~/Library/Preferences -newer /tmp/prefs-marker -type f
```

### 9.2 排查陷阱

| 陷阱 | 现象 | 识别方法 |
|------|------|----------|
| 应用写入的垃圾数据 | 候选键在 baseline 中已有值，但 diff off vs on 无变化 | diff 验证无变化，删除后系统行为不变 |
| 状态记录键（非控制键） | 候选键在 on/off 状态值不同，但删除 + 重启进程后被系统自动重新写入 | 删除键 + 重启进程，系统重新写入 → 状态记录键 |
| cfprefsd 缓存与文件不一致 | `plutil -p` 读到的值与 `defaults read` 读到的值不同 | 两者对比差异 → cfprefsd 缓存未同步，以 `defaults read` 为准（内存值） |
| ByHost 域必须用 -currentHost | 普通 `defaults read com.apple.controlcenter` 读不到 ByHost 域的键 | 域名前缀 `~/Library/Preferences/ByHost/` → 必须 `defaults -currentHost` |
| 多 API 变化只改一处 | diff 发现多个键变化，误改其中一个不生效 | diff 输出多个候选时逐个验证；优先用 `find -newer` 锁定单一文件 |

### 9.3 排查案例：Tahoe 电池百分比

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1. 基线 | dump NSGlobalDomain / controlcenter / menuextra.battery | 发现 `BatteryshowPercent=1`、`BatteryShowPercentage=1`、`ShowPercent=1` 三个候选 |
| 2. diff baseline vs off | 用户手动隐藏 | 三个候选键**无任何变化** → 垃圾数据 |
| 3. diff off vs on | 用户手动显示 | 新增 `NSStatusItem VisibleCC Battery=1`、`NSStatusItem Preferred Position Battery=257` |
| 4. 误改 VisibleCC Battery | 写入/删除该键 + killall ControlCenter | UI 不生效 |
| 5. 删除两个键 + 重启 | 验证是否控制键 | ControlCenter 重启后**自动重新写入** `VisibleCC Battery=1` → 状态记录键 |
| 6. `find -newer` | 定位切换时被修改的文件 | 发现 `~/Library/Preferences/ByHost/com.apple.controlcenter.<UUID>.plist` 之前不存在，切换后出现 |
| 7. `defaults -currentHost read` | 读 ByHost 域 | `Battery` 键从 8(off)→ 2(on) 变化，`BatteryShowPercentage` 保持 1 不变 |
| 8. 实证写入 | `defaults -currentHost write com.apple.controlcenter Battery -int 8` + `killall ControlCenter` | UI 立即隐藏 ✓ |

---

## 10. 组件放置规则

| 范围 | 位置 |
|------|------|
| 跨功能共享基础组件 | `components/ui/` |
| 壳层布局 | `components/layout/` |
| 跨功能共享逻辑 | `shared/` |
| 单功能内部组件 | feature 内 `components/` |
| 纯工具函数 | `lib/` |
| 平台能力封装 | `platform/` |

`SettingGroup` 在 system-settings 和 dev-toolbox 两个 feature 使用后，已从 `system-settings/components/` 上提到 `components/ui/`。

---

## 11. 功能审计报告

> 对照本规范对当前代码库的审计结果。

### 11.1 不符合项清单

| 编号 | 规范条目 | 文件 | 问题描述 | 优先级 | 影响 |
|------|----------|------|----------|--------|------|
| NC-1 | C-6 | `system_toggles.rs:128` | `CreateDesktop` 写 "0"/"1" 走 `-string`，应为 `-bool` | 高 | 桌面图标隐藏可能失效 |
| NC-2 | C-6 | `system_toggles.rs:273` | `springboard-rows` 写 "6"/"5" 走 `-string`，应为 `-int` | 高 | Launchpad 小图标设置可能失效 |
| NC-3 | C-6 | `quick_actions.rs:21` | `askForPassword` 写 "1"/"0" 走 `-string`，应为 `-bool` | 高 | 锁屏密码开关可能失效 |
| NC-4 | C-6 | `quick_actions.rs:23,44` | `askForPasswordDelay` 写数字走 `-string`，应为 `-int` | 高 | 锁屏延迟设置可能失效 |
| NC-5 | C-6 | `helpers.rs:76` | `defaults_write` 缺少 `-int` 分支，所有数字入参被当作字符串 | 高 | 根因：影响上述 NC-1~4 |
| NC-6 | A-2 | `privacy.rs:40` | `reset_tcc_permission` 未校验 `service` 白名单，与 `get_tcc_permissions` 不一致 | 高 | 可重置任意 TCC 服务 |
| NC-7 | A-1 | `screenshot.rs:13` | `set_screenshot_format` 未校验 format 白名单 | 中 | 可写入非法格式值 |
| NC-8 | A-4 | `screenshot.rs:76` | `set_screenshot_save_location` 未校验路径 | 中 | 可写入任意路径 |
| NC-9 | A-1 | `network.rs:122,159,172,190` | ping/dig/nc/traceroute 的 host 未校验，可被解释为 flag | 中 | flag 注入风险 |
| NC-10 | P-1/P-2 | `network.rs:214` | `get_local_ip` 调用 `curl ifconfig.me` 泄露公网 IP 给第三方 | 高 | 隐私违规 |
| NC-11 | P-4 | `privacy.rs:18` | TCC.db 读取失败时返回空列表而非明确错误 | 中 | 用户误判权限状态 |

### 11.2 重构方案

**方案 A：修复 `defaults_write` 类型分发（根因修复，影响 NC-1~5）**
- 在 `helpers.rs` 的 `defaults_write` 增加 `-int` 分支：数字字符串走 `-int`
- 将 `system_toggles.rs` / `quick_actions.rs` 中布尔字段改为传 "true"/"false"
- 整数字段（`springboard-rows`、`askForPasswordDelay`）由 helper 自动走 `-int`

**方案 B：补齐输入校验（影响 NC-6~9）**
- `privacy.rs`：提取 `ALLOWED_SERVICES` 为共享常量，`reset_tcc_permission` 复用校验
- `screenshot.rs`：增加 format 白名单 `["png","jpg","bmp","pdf","tiff"]`、路径元字符过滤
- `network.rs`：提取 `validate_host` 校验 hostname/IP 格式，拒绝以 `-` 开头的输入

**方案 C：修复隐私泄露（影响 NC-10）**
- `get_local_ip`：默认仅返回本地 IP，公网 IP 改为独立命令 `get_external_ip` 并由前端显式触发 + 确认

**方案 D：TCC 错误可识别（影响 NC-11）**
- `get_tcc_permissions`：检测 sqlite3 退出码非零或 stderr 非空时返回明确错误

### 11.3 实施优先级

| 优先级 | 方案 | 理由 |
|--------|------|------|
| P0 | 方案 A | 同类根因，直接影响多个功能是否生效 |
| P0 | 方案 B (privacy) | 安全漏洞，可重置任意 TCC 服务 |
| P1 | 方案 C | 隐私违规，未经同意外发数据 |
| P1 | 方案 B (screenshot/network) | 输入校验加固 |
| P2 | 方案 D | 体验优化，避免误判 |

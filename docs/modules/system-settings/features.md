# System Settings 功能说明

> 视角：产品 / 用户能力。技术实现见 [design.md](./design.md)；迭代规划见 [roadmap.md](./roadmap.md)。

## 1. 一句话定义

**一个 macOS 系统偏好控制台——把分散在 System Settings、Finder、Dock、终端 defaults 里的开关集中到一个界面，开发者常用的开关一键即达。**

bench 不替代系统设置，而是把高频开发相关开关做成"快捷面板"：键盘、Dock、菜单栏、Finder、TCC 权限、登录项、低电量模式等。

## 2. 解决的问题

| 痛点 | bench 的解法 |
|------|-------------|
| 系统设置分散在 10+ 面板，找个开关要点 3-4 次 | 按"外观 / 安全 / 系统"三 Tab 聚合，搜索栏直达 |
| `defaults write` 命令记不住 | UI 开关即点即用，类型自动正确（bool / int / string） |
| 修改 defaults 后不生效 | 自动调用 `killall` 刷新对应进程（SystemUIServer / ControlCenter / WindowManager） |
| macOS 版本差异导致开关失效 | 版本感知：自动检测 macOS 主版本号，走对应分支 |
| Tahoe 上部分 defaults 不再是控制键 | 自动降级为 AppleScript / System Events 控制 |
| TCC 权限查询要 sqlite3 命令 | UI 一键查询，权限缺失时明确提示（而非空列表） |
| 危险操作（关机 / 重启 / 清废纸篓）误触 | 二次确认对话框 + 后果说明 |
| 找不到某项设置在哪 | 顶部搜索栏输入关键字，结果带 Tab 徽章直接跳转 |

## 3. 模块结构

### 3.1 三个 Tab

| Tab | 职责 | 内容 |
|-----|------|------|
| 外观 | 用户可见的系统外观 | 电池百分比 / Dock 位置与自动隐藏 / Dock 最小化动画 scale / 菜单栏自动隐藏（四态）/ 桌面图标 / 截图格式与保存位置 |
| 安全 | 安全与隐私控制 | 锁屏密码与延迟 / 防火墙 / SSH 远程登录 / 屏幕共享 / AirDrop / Gatekeeper（只读）/ TCC 权限管理 / 麦克风静音 |
| 系统 | 系统行为控制 | Finder 配置（7 项）/ 键盘 Fn 键 / 键盘文本替换开关 / 按键重复速率 / 电源与低电量模式（四态）/ 屏保 / 登录项管理 / LaunchAgents & Daemons / 快捷操作（锁屏 / 关机 / 重启等，独立危险操作分区） |

### 3.2 与 App 偏好的边界

- **App 偏好**（主题 / 语言 / 窗口主题）通过 `SettingsDialog` 弹窗控制，入口为侧边栏底部 ⚙ 齿轮或 App 菜单 → Preferences
- **系统设置**（本模块）控制宿主 macOS，与 bench 自身配置分离

## 4. 已实现功能

### 4.1 设置搜索 MVP

**入口**：顶部搜索栏（始终可见）。

**功能**：
- 输入关键字，模糊匹配 i18n 标签（中英双语）
- 结果列表展示：匹配项标题 + 所属 Tab 徽章
- 点击结果直接切换到对应 Tab + Section
- 搜索时隐藏 Tab 栏，仅显示结果列表
- 清空搜索恢复 Tab 浏览模式

**搜索索引**：~50 个条目，覆盖三个 Tab 所有可见开关的 i18n 标签。

### 4.2 外观 Tab

#### 4.2.1 电池百分比显示

切换菜单栏电池图标是否显示百分比。

**版本感知**：
- macOS 26 (Tahoe)+：写入 `ByHost/com.apple.controlcenter Battery -int 2|8`，刷新 `killall ControlCenter`
- macOS 25 及更早：写入 `com.apple.menuextra.battery ShowPercent -bool true|false`，刷新 `killall SystemUIServer + ControlCenter`

#### 4.2.2 Dock 配置

| 配置项 | 说明 |
|--------|------|
| Dock 位置 | 左 / 下 / 右三选一 |
| 自动隐藏 Dock | 开 / 关 |
| 最小化动画 | 妙想 / 缩放 / 系统（v1.17 新增 scale 开关） |
| 显示最近应用 | 开 / 关 |

#### 4.2.3 菜单栏自动隐藏（四态）

| 选项 | 行为 |
|------|------|
| Never（永不） | 始终显示 |
| In Full Screen Only（仅全屏时） | 仅全屏时隐藏 |
| On Desktop Only（仅桌面时） | 仅桌面时隐藏 |
| Always（始终） | 始终隐藏 |

**实现方式**：macOS Tahoe+ 上 `defaults write` 仅写状态记录键不触发行为，必须通过 System Events AppleScript 控制（与 System Settings 同路径）。

#### 4.2.4 桌面与截图

| 配置项 | 说明 |
|--------|------|
| 隐藏桌面图标 | 隐藏桌面上所有文件与文件夹 |
| 截图格式 | png / jpg / bmp / pdf / tiff |
| 截图关闭阴影 | 开 / 关 |
| 截图显示缩略图 | 开 / 关 |
| 截图保存位置 | 文件夹选择器 |

### 4.3 安全 Tab

#### 4.3.1 锁屏

| 配置项 | 说明 |
|--------|------|
| 锁屏密码要求 | 开 / 关（启用后需密码解锁） |
| 锁屏延迟 | 0 / 5 / 60 秒（启用密码后延迟多久触发） |

#### 4.3.2 网络与共享

| 配置项 | 说明 |
|--------|------|
| 防火墙 | 开 / 关（需 sudo） |
| SSH 远程登录 | 开 / 关（系统服务） |
| 屏幕共享 | 开 / 关（系统服务） |
| AirDrop | 允许 / 禁止 |

#### 4.3.3 Gatekeeper（只读）

显示当前"允许以下来源的应用程序"状态：
- App Store
- App Store 和已识别的开发者

**注意**：Tahoe 上无法从命令行控制，仅显示当前状态。

#### 4.3.4 TCC 权限管理

- 列出所有 TCC 服务（相机 / 麦克风 / 通讯录 / 位置 / 完全磁盘访问等）的当前授权状态
- 支持按服务筛选
- 支持重置单个 TCC 权限（需确认）
- 权限缺失（如缺完全磁盘访问）时明确提示，而非空列表

#### 4.3.5 麦克风静音

一键静音 / 取消静音系统麦克风。

### 4.4 系统 Tab

#### 4.4.1 Finder 配置（7 项）

| 配置项 | 说明 |
|--------|------|
| 显示隐藏文件 | 开 / 关 |
| 显示路径栏 | 开 / 关 |
| 显示状态栏 | 开 / 关 |
| 显示 Library 目录 | 开 / 关 |
| 显示文件扩展名 | 开 / 关 |
| 搜索范围（当前文件夹） | 开 / 关 |
| 禁用 .DS_Store | 网络卷 / 外部卷 |

#### 4.4.2 键盘

| 配置项 | 说明 |
|--------|------|
| Fn 键行为 | 标准 F1-F12 / 功能键（亮度 / 音量等） |
| 文本替换开关 | 开 / 关（v1.17 新增） |
| 按键重复速率 | 滑块（慢 - 快） |
| 按键重复延迟 | 滑块（短 - 长） |
| 关闭自动纠正 | 开 / 关 |
| 关闭智能引号 | 开 / 关 |
| 关闭破折号替换 | 开 / 关 |
| 关闭自动大写 | 开 / 关 |

#### 4.4.3 电源

| 配置项 | 说明 |
|--------|------|
| 防止休眠 | 开 / 关（通过 `caffeinate` 或 pmset） |
| 低电量模式（四态） | 永不 / 始终 / 仅使用电池时 / 仅电源适配器时 |

**低电量模式四态**：macOS Tahoe 上从二态扩展为四态，通过 `pmset -b`（电池）与 `pmset -c`（电源）分别控制，需 sudo 权限。

#### 4.4.4 屏保

选择屏幕保护程序。

#### 4.4.5 登录项管理

- 列出所有登录项（用户级）
- 列出所有 LaunchAgents（用户级）
- 列出所有 LaunchDaemons（系统级，需 sudo）
- 支持启用 / 禁用单项
- 支持删除登录项

#### 4.4.6 快捷操作（独立危险操作分区）

| 操作 | 说明 |
|------|------|
| 锁屏 | 立即锁屏 |
| 关机 | 二次确认 |
| 重启 | 二次确认 |
| 清空废纸篓 | 二次确认 |
| 释放端口（跳转 Port Manager） | 跳转 |
| 休眠 | 立即休眠 |

**安全设计**：所有不可逆操作（关机 / 重启 / 清废纸篓 / 删除登录项）经 `DestructiveConfirmDialog` 二次确认 + 后果说明。

## 5. 用户界面要点

### 5.1 顶部搜索栏

```
[🔍 搜索设置项...]                    [✕]
```

- 输入即搜，无需回车
- 结果列表带 Tab 徽章
- 点击结果跳转 + 清空搜索

### 5.2 Tab 切换

```
[外观]  [安全]  [系统]
─────────────────────────
... Section 内容 ...
```

- 三个 Tab 平铺
- 每个 Section 内开关用 `SettingGroup` 统一布局：`flex items-center justify-between py-2`
- Switch 组件 loading 时显示旋转图标
- 危险操作用 `destructive` 颜色按钮

### 5.3 危险操作确认

```
┌─────────────────────────────────────┐
│ ⚠️ 确认关机                          │
├─────────────────────────────────────┤
│ 即将关机，所有未保存的工作将丢失      │
│                                     │
│ [取消]  [关机]                       │
└─────────────────────────────────────┘
```

## 6. 安全设计

### 6.1 隐私保护

- **禁止主动外发用户数据**：所有网络诊断命令的目标地址由用户显式输入
- **外部 IP 查询须显式同意**：必须用本地可推导方式优先，或调用前确认
- **敏感信息读取需说明用途**：读取 SSID / TCC / 登录项时不回传无关字段
- **TCC.db 访问失败须可识别**：返回明确错误而非空列表
- **不持久化用户敏感数据**：仅读写系统 defaults，不自建数据库

### 6.2 授权机制

- **输入白名单校验**：所有字符串参数做白名单或格式校验，防 flag 注入
- **读写校验对齐**：读命令的校验规则写命令必须同样校验
- **sudo 操作经 GUI 授权**：通过 `osascript` GUI 弹窗，不静默调用 `sudo`
- **路径校验**：过滤 shell 元字符并 `shell_escape`
- **AppleScript 注入防护**：所有拼接字符串经 `escape_applescript`

### 6.3 便利性原则

- **统一 applying 管理**：所有变更经 `useSettingAction` 包装，期间 `applying=true` 阻塞并发，toast 反馈
- **设置后即时回读**：系统状态可能与请求不一致的设置（如电池百分比）写入后 `refresh()` 重新读真实状态
- **窗口聚焦自动刷新**：监听 `onFocusChanged`，与外部应用（如 OnlySwitch）保持同步
- **加载态可视化**：Switch loading 时显示 `Loader2Icon animate-spin`，`aria-busy` 与 `cursor-progress`
- **危险操作二次确认**：所有不可逆操作经 `DestructiveConfirmDialog`，禁裸 `window.confirm()`
- **defaults 类型正确**：布尔用 `-bool`、整数用 `-int`、字符串用 `-string`，错误类型会导致系统忽略

## 7. 系统兼容性

### 7.1 版本感知

bench 自动检测 macOS 主版本号，对行为有差异的设置走对应分支：

| 设置 | macOS 25- | macOS 26 (Tahoe)+ |
|------|-----------|-------------------|
| 电池百分比 | `com.apple.menuextra.battery ShowPercent -bool` | `ByHost/com.apple.controlcenter Battery -int` |
| 菜单栏自动隐藏 | `defaults write` 即可 | 必须 System Events AppleScript |
| 菜单栏刷新 | `killall SystemUIServer` | + `killall WindowManager` |
| 低电量模式 | 二态（开 / 关） | 四态（Battery/AC 分别） |

### 7.2 ByHost 域

读 / 写 `~/Library/Preferences/ByHost/<domain>.<UUID>.plist` 时必须用 `defaults -currentHost`，普通 `defaults read/write` 读不到这些键。Tahoe+ 电池百分比即存储在 ByHost 域。

### 7.3 cfprefsd 时序

`defaults write` 通过 cfprefsd 缓存写入。若先写入再 kill cfprefsd，cfprefsd 重启时可能丢弃未同步的写入。**必须先 kill cfprefsd 清除缓存（sleep 500ms），再执行 `defaults write`**。

### 7.4 状态记录键 vs 控制键

macOS Tahoe 上某些 defaults 键（如菜单栏自动隐藏的 `AppleMenuBarVisibleInFullscreen`、`_HIHideMenuBar`）仅为**状态记录键**，`defaults write` 不触发系统行为变更。必须通过 System Events AppleScript 操控。

新增设置项时须区分「状态记录键」和「控制键」，违反此规则的功能会表现为「值已写入但行为不变」。

## 8. 默认浏览器选择

bench 在 macOS 系统设置中注册为 `http` / `https` 处理器（不抢默认），用户可：
- 通过系统"默认网页浏览器"切换为 bench（配合外部登录代理功能）
- 通过浏览器选择器（如 Velja / Browserosaurus）临时选 bench
- bench 不接管普通网页浏览

详见 Account Manager 的外部登录代理功能。

## 9. 未来规划

详见 [roadmap.md](./roadmap.md)：

- **浏览器名称 canonical value + locale 映射**
- **启动配置读取失败传播到前端 UI**
- **精选 candidates：隐藏桌面(Q)**（v1.17 剩余）
- **设置导入/导出**（v1.18 候选）
- **store 中未使用字段清理**（v1.16 剩余）

更多 macOS 待选开关库（Finder / Dock / 键盘 / 触控板 / 显示 / Mission Control / 维护工具 / 系统监控 / 音频 / 蓝牙 / 显示器 / 菜单栏 / 文件操作 / 剪贴板 / Xcode / 外接设备 / 桌面壁纸 等）见 [roadmap.md](./roadmap.md) 引用。

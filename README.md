# Bench

> A macOS-first desktop workbench for launching applications, managing isolated accounts, and controlling system settings.
>
> 以 macOS 为主的桌面工作台，重点解决应用启动、隔离账号管理和系统设置三个高频场景。

Bench 基于 Tauri v2、React 和 Rust。当前仓库版本为 `1.23.0`，正在进行 2.0 发布前收口；已经实现但尚未完成目标平台真机验收的能力会明确标记为待验证，不以“可以编译”代替跨平台支持。

## 核心能力 / Core Workflows

### 1. 应用启动与管理 / App Launch & Management

Quick Launch 和 App Manager 共用同一份后端应用清单，避免扫描结果、分类和更新状态互相漂移。

- **快速启动**：搜索、分类、拖拽排序、用户覆盖和虚拟化应用网格；图标按可见项加载。
- **跨平台清单**：macOS 识别 `.app`、bundle 与安装来源；Windows 识别传统 EXE/MSI、Registry、Start Apps 和 AUMID。
- **可靠启动**：前端只提交稳定 `appId`，由 Rust 后端解析 `.app`、EXE 或 AUMID 启动目标，不接受 renderer 传入任意可执行路径。
- **应用管理**：检查更新、升级、卸载、批量操作、取消与逐项结果；provider 明确区分 `ok / partial / unsupported / failed`。
- **安全更新**：破坏性操作要求可验证的 receipt、package ID 或 ProductCode；下载和替换流程包含 HTTPS、签名/哈希、身份、架构、资源上限与恢复检查。

当前状态：macOS 和 Windows 核心代码已经接线，正式发布前仍需完成两平台真实应用 fixture、启动 smoke 和 500+ 应用性能验收。

文档：[Quick Launch](./docs/modules/quick-launch/README.md) · [App Manager](./docs/modules/app-manager/README.md)

### 2. 账号管理 / Account Manager

Account Manager 面向需要在同一站点维护多个隔离登录态的场景。

- **账号级隔离**：每个账号使用独立 WebView data directory/data store，避免 Cookie 和浏览器状态串号。
- **加密持久化**：主密钥保存在 macOS Keychain 或 Windows Credential Manager；密码和 Session 使用 AES-256-GCM 加密。
- **Session 恢复**：保存 HttpOnly Cookie、canonical expiry、精确 origin 的 localStorage/sessionStorage，以及受限、可校验的 IndexedDB schema 与记录；恢复后必须经过真实 probe 才能标记 Ready。
- **认证检测**：支持 HTTP、WebView 和 Hybrid probe，具备账号级 single-flight、并发上限、瞬态重试预算和结构化 partial 结果。
- **外部登录代理**：支持 `bench-auth://` Deep Link、一次性后端 ticket、精确 callback/state/origin 校验和冷/热启动有界队列；原始敏感 URL 不进入前端 store。
- **能力声明**：后端逐项返回 `supported / partial / unsupported / failed`，前端据此禁用具体操作并显示原因。

当前限制：macOS/Windows Keyring、WebView、Session 恢复和 Deep Link 仍需按文档做真机验收；Windows 登录 WebView 网络代理明确为 `unsupported`，失败时不会退回共享系统浏览器或静默直连。Tauri 当前不提供 Cookie partition key，因此 partitioned Cookie 不会降级进入 HTTP probe。

文档：[Account Manager](./docs/modules/account-manager/README.md) · [双平台验收方法](./docs/modules/account-manager/roadmap.md#真机验收步骤)

### 3. 系统设置 / System Settings

System Settings 是面向 macOS 14+ 的受控设置中心，不尝试复制整个系统设置应用。

- **显示与 Dock**：Dock、菜单栏、显示和低电量相关设置。
- **Finder 与截图**：隐藏文件、路径栏、状态栏、扩展名、截图格式/阴影/缩略图/保存位置。
- **键盘与快捷操作**：键盘行为、常用系统面板和受控系统动作。
- **锁屏、睡眠与网络**：锁屏、防睡眠、Firewall、SSH、屏幕共享、AirDrop 等能力。
- **默认浏览器与应用授权**：canonical 默认浏览器读取/设置、Gatekeeper/quarantine 授权流程。
- **可靠写入**：读取当前值、执行受控 adapter、重新读取并比对目标值；读取失败显示 unknown/error，不伪装成“关闭”。

该模块只面向 macOS。新增设置必须先验证系统版本、权限、真实控制接口和可逆性；Finder、截图、网络、Dock 与默认浏览器仍保留目标版本真机 read-after-write/权限拒绝回归。

文档：[System Settings](./docs/modules/system-settings/README.md) · [技术设计](./docs/modules/system-settings/design.md)

## 其他功能 / More Tools

- **Dev Toolbox**：端口管理、开发项目清理、环境检测、Token 计算、格式转换和网络诊断。
- **Clean Space**：macOS 存储概览与受控清理，带路径白名单、逐项结果和真实释放量。
- **Hardware Compare**：硬件规格查询与对比。
- **Terminology**：可搜索、可固定的行业术语与关联站点库。
- **全局能力**：中英文切换、浅色/深色/系统主题、菜单栏托盘、防睡眠和签名校验的应用内更新。

## 平台状态 / Platform Status

| 能力                       |    macOS 14+     | Windows 11 | 说明                                                 |
| -------------------------- | :--------------: | :--------: | ---------------------------------------------------- |
| Quick Launch / App Manager |    待真机验收    | 待真机验收 | 核心实现完成；fixture、启动与更新/卸载 smoke 未完成  |
| Account Manager            |    待真机验收    | 待真机验收 | capability gate 已实现；Windows WebView proxy 不支持 |
| System Settings            | 支持，待版本回归 |   不适用   | macOS 专属系统 adapter                               |
| Dev Toolbox                |       支持       |  部分支持  | 以各子模块的 capability 为准                         |
| Clean Space / Hardware     |       支持       |   不适用   | 2.0 维持 macOS-only                                  |
| Terminology                |       支持       |    支持    | 纯前端与本地持久化                                   |

2.0 正式目标是 macOS 14+（Apple Silicon/Intel）和 Windows 11 x64；Linux 当前不是发布目标。剩余步骤与停止条件见[2.0 最终路线图](./docs/ROADMAP.md)。

## 安装说明 / Installation

构建产物发布在 [GitHub Releases](https://github.com/indredK/bench/releases)。当前没有 Apple Developer Program 或 Windows Authenticode 证书：

- macOS 包使用 ad-hoc 签名，首次安装可能需要在“系统设置 → 隐私与安全性”中手动允许。
- Windows 安装包未做 Authenticode 签名，系统可能显示 Unknown Publisher。
- Release 应同时提供 `OS-SIGNING-NOTICE.txt` 和 `SHA256SUMS`；应用内 updater 仍独立使用 Tauri minisign 校验。

不要把 updater 签名理解为操作系统代码签名。正式 Apple notarization 和 Windows Authenticode 会在取得开发者证书后启用。

## 本地开发 / Development

### 环境

- Node.js `>=24`
- pnpm `11.8.0`（以 `package.json#packageManager` 为准）
- Rust stable
- macOS：Xcode Command Line Tools
- Windows：Visual C++ Build Tools 与 WebView2 Runtime

### 常用命令

```bash
corepack enable
pnpm install
pnpm run dev
```

```bash
pnpm run lint:fe       # TypeScript、i18n、文档一致性
pnpm run test:critical # 核心功能回归
pnpm run test          # 前端 + Rust 全量测试
pnpm run build         # 当前平台 Tauri bundle
```

Git hooks 会在安装依赖时配置；也可以显式运行 `pnpm run hooks:install`。开发服务器地址为 `http://localhost:1420`。

## 技术栈 / Stack

- Tauri v2、Rust 2021
- React 19、TypeScript 6、Vite 8
- Tailwind CSS 4、shadcn/ui、Lucide
- Zustand、Wouter、i18next
- Vitest、Testing Library

## 文档与贡献 / Docs & Contributing

- 人类文档入口：[docs/START-HERE.md](./docs/START-HERE.md)
- 架构与禁止模式：[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- 编码规范：[docs/coding-standards.md](./docs/coding-standards.md)
- 开发流程：[docs/development-workflow.md](./docs/development-workflow.md)
- 当前发布目标：[docs/ROADMAP.md](./docs/ROADMAP.md)
- AI 操作入口：[AGENTS.md](./AGENTS.md)

提交代码前至少运行：

```bash
pnpm run lint:fe
pnpm run test:critical
pnpm run clippy:be
```

## License

[MIT](./LICENSE)

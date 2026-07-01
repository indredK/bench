# Bench - DevTools / 开发者工具

> A cross-platform desktop utility centered on macOS system management: quick launch, app & account management, terminology, dev toolbox, and deep system settings — with Windows/Linux support where applicable.
> 以 macOS 系统管理为核心的跨平台桌面工具：快速启动、应用与账号管理、术语库、开发工具箱与系统设置；部分能力在 Windows/Linux 可用。

Built with [Tauri v2](https://v2.tauri.app/) + [React 19](https://react.dev/) + [Rust](https://www.rust-lang.org/).

Menu bar **tray** for show-window / prevent-sleep / quit. Dangerous actions use a shared confirmation dialog with consequence callout.

---

## Features / 功能

### Sidebar / 侧边栏入口

| Module / 模块 | Description / 描述 |
| :--- | :--- |
| **Quick Launch / 快速启动** | Drag-and-drop app launcher with categories, pinned items, and quick open. 分类拖拽启动器，支持固定与快速打开。 |
| **App Manager / 应用管理** | Cross-platform installed app discovery (macOS/Windows/Linux), source identification, batch upgrade/uninstall with safety gates. 跨平台应用发现、来源识别、批量升级/卸载及安全保护。 |
| **Hardware Compare / 硬件查询** | Query and compare hardware specifications across devices. 查询和对比不同设备的硬件规格。 |
| **Terminology / 术语库** | Industry/category/subcategory taxonomy with searchable terms, websites, and pin support. 按行业/分类管理术语，支持搜索、关联站点与固定。 |
| **Account Manager / 账号管理** | Multi-station account sessions, external login proxy, webview auth, encrypted storage. 多站点账号会话、外部登录代理、WebView 授权与加密存储。 |
| **Dev Toolbox / 开发工具箱** | Unified tabbed hub — see below. 统一 Tab 入口，见下表。 |
| **System Settings / 系统设置** | macOS appearance/security/system controls: Dock, Finder, keyboard, sleep inhibitor, login items, maintenance, quick actions (lock/reboot/shutdown/trash). macOS 外观/安全/系统控制：Dock、Finder、键盘、防睡眠、登录项、维护与快捷操作。 |

### Dev Toolbox tabs / 开发工具箱子页

| Tab / 子页 | Description / 描述 |
| :--- | :--- |
| **Port Manager / 端口管理** | Multi-format port input (single/range/comma), common port quick-add, kill processes with confirmation + status feedback. 多种端口输入、常用端口快捷添加、释放进程（二次确认）与状态反馈。 |
| **Dev Cleaner / 垃圾清理** | Scan workspace directories for build artifacts (`node_modules`, `target`, `.venv`, `dist`, etc.), batch cleanup. 扫描工作区构建产物，支持批量清理。 |
| **Env Detector / 环境检测** | Detect installed development tools (runtimes, package managers, etc.). 检测已安装的开发工具与运行环境。 |
| **Token Calculator / Token 计算** | Pricing standards, model compare, cost calculator; live USD/CNY rate (Frankfurter API + cache). 计费标准、模型对比与成本计算；实时 USD/CNY 汇率（API + 缓存）。 |
| **Dev Tools / 开发工具** | JSON format/minify, Base64, hash, UUID, timestamp helpers. JSON 格式化/压缩、Base64、哈希、UUID、时间戳工具。 |
| **Diagnostics / 网络诊断** | Ping, DNS lookup, traceroute-style checks. Ping、DNS 查询等网络诊断。 |
| **System Info / 系统信息** | Native hardware & OS details via Rust backend; browser fallback in web mode. Rust 后端原生系统详情，Web 模式可回退。 |

### App-wide / 全局

| Capability / 能力 | Description / 描述 |
| :--- | :--- |
| **Menu bar tray / 菜单栏托盘** | Show window, toggle prevent sleep (syncs with sleep inhibitor), quit. 显示窗口、切换防睡眠、退出。 |
| **Auto Updater / 自动更新** | In-app version update with signature verification, progress tracking, and error recovery. 应用内更新，签名校验与进度跟踪。 |
| **Theme Switcher / 主题切换** | Light/Dark/System theme with instant switching. 浅色/深色/跟随系统，即时切换。 |
| **i18n / 国际化** | English & Simplified Chinese, instant switch without restart. 中英文双语，无需重启即时切换。 |

> **Platform note / 平台说明**: System Settings, tray, and most macOS defaults toggles require **macOS**. Port Manager, App Manager, Dev Cleaner, and Env Detector work on desktop targets where implemented.

---

## Tech Stack / 技术栈

| Layer / 层 | Technology / 技术 |
| :--- | :--- |
| Desktop Framework | [Tauri v2](https://v2.tauri.app/) |
| Frontend / 前端 | [React 19](https://react.dev/), [TypeScript 6](https://www.typescriptlang.org/), [TailwindCSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) |
| Bundler / 构建 | [Vite 8](https://vitejs.dev/) |
| Backend / 后端 | [Rust](https://www.rust-lang.org/) (edition 2021) |
| State / 状态管理 | [Zustand](https://zustand.docs.pmnd.rs/) |
| Routing / 路由 | [Wouter](https://github.com/molefrog/wouter) |
| i18n | [i18next](https://www.i18next.com/) + [react-i18next](https://react.i18next.com/) |
| Testing / 测试 | [Vitest](https://vitest.dev/), [Testing Library](https://testing-library.com/) |
| CI/CD | GitHub Actions (4 targets: macOS Intel/Apple Silicon, Windows, Linux) |

---

## Quick Start / 快速开始

### Prerequisites / 环境要求

- **Node.js** ≥ 18 (recommended v22)
- **Rust** latest stable → [rustup.rs](https://rustup.rs/)
- **Platform deps / 平台依赖**:
  - **macOS**: `xcode-select --install`
  - **Linux**: `libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev` etc.
  - **Windows**: [VC++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + WebView2

### Development / 开发

```bash
npm install        # Install deps / 安装依赖
npm run dev        # Start Tauri dev with HMR / 启动 Tauri 开发模式（热更新）
```

`npm run hooks:install` (or `npm run setup`) will configure the repo Git hooks in `.husky/`, so staged code gets checked before commits. `npm run setup` is intentionally lightweight and does not modify global Rust or npm settings.

Dev server runs at `http://localhost:1420`.

### Build / 构建

```bash
npm run build      # Production build for current platform / 当前平台生产构建
```

Outputs in `src-tauri/target/release/bundle/`:
- **macOS**: `.dmg`
- **Windows**: `.msi` / `.exe`
- **Linux**: `.deb` / `.AppImage`

### Test / 测试

```bash
npm run test       # Frontend + Backend tests / 前后端测试
```

---

## Project Structure / 项目结构

```
bench/
├── src/                              # React Frontend / 前端
│   ├── components/
│   │   ├── common/                   # Shared dialogs & gates / 共享对话框与门控
│   │   │   ├── DestructiveConfirmDialog.tsx  # Dangerous action confirm / 危险操作确认
│   │   │   ├── AboutDialog.tsx, UpdateDialog.tsx, SettingsDialog.tsx, ...
│   │   │   └── RuntimeFeatureGate.tsx, DesktopOnly.tsx
│   │   ├── content/                  # Virtual table/grid views / 虚拟化视图
│   │   ├── layout/                   # Sidebar, titlebar, theme/lang switchers / 壳层与导航
│   │   └── ui/                       # shadcn/ui primitives / 基础 UI 组件
│   ├── data/                         # Hardware datasets / 硬件数据集
│   ├── features/                     # Feature modules (feature.tsx → page.tsx) / 功能模块
│   │   ├── quick-launch/             # App launcher / 快速启动
│   │   ├── app-manager/              # Installed apps / 应用管理
│   │   ├── hardware/                 # Hardware compare / 硬件对比
│   │   ├── terminology/              # Term glossary / 术语库
│   │   ├── account-manager/          # Account sessions & auth proxy / 账号管理
│   │   ├── dev-toolbox/              # Tab hub (ports, cleaner, env, token, …) / 开发工具箱
│   │   ├── port-manager/             # Port kill (also routed standalone) / 端口管理
│   │   ├── dev-cleaner/              # Build artifact cleanup / 构建清理
│   │   ├── env-detector/             # Dev environment scan / 环境检测
│   │   ├── token-calculator/         # Token pricing & FX rate / Token 计算
│   │   ├── system-settings/          # macOS system controls / 系统设置
│   │   ├── updater/                  # In-app update client / 应用更新
│   │   ├── registry.tsx              # Feature registry & sidebar nav / 功能注册表
│   │   └── types.ts
│   ├── lib/tauri/                    # IPC commands, contracts, types / IPC 绑定
│   ├── platform/                     # Browser vs desktop abstractions / 平台抽象
│   ├── shared/                       # Compare matrix, context menus / 共享 UI
│   ├── i18n/locales/{en,zh}.json
│   ├── App.tsx, main.tsx, splash.ts
├── src-tauri/                        # Rust Backend / 后端
│   └── src/
│       ├── account_manager/          # Sessions, webview, auth proxy / 账号管理
│       ├── app_manager/              # macOS / Windows / Linux app ops / 应用管理
│       ├── app_updater/              # Signed updater / 应用更新
│       ├── dev_cleaner/              # Project scan & cleanup / 构建清理
│       ├── env_detector/             # Tool inventory / 环境检测
│       ├── port_manager/             # Port scan & kill / 端口管理
│       ├── system_settings/          # macOS defaults & shell ops / 系统设置
│       ├── sleep_inhibitor/          # caffeinate / prevent sleep / 防睡眠
│       ├── terminology/              # Term storage & CRUD / 术语库
│       ├── token_calculator/         # Pricing standards / Token 计费标准
│       ├── tray.rs                   # Menu bar tray / 菜单栏托盘
│       ├── file_ops.rs, error.rs, bootstrap.rs, menu.rs, window_theme.rs
│       ├── commands.rs, lib.rs, main.rs
├── docs/                             # [Docs index](./docs/README.md)
│   ├── README.md
│   ├── coding-standards.md
│   ├── modules/                      # 按模块：roadmap.md, bugs.md, 设计稿
│   └── roadmap/                      # 全局 release-themes.md
├── scripts/                          # Bootstrap, quality gates, release / 脚本
├── .github/workflows/ci-build.yml
└── package.json
```

---

## Configuration / 配置

Key settings in `src-tauri/tauri.conf.json`:

| Setting / 配置项 | Value / 值 |
| :--- | :--- |
| App ID | `com.bench.app` |
| Window Size / 窗口大小 | 1280 × 800 (min 960 × 600) |
| Dev Server | `http://localhost:1420` |
| Bundle Targets / 打包目标 | dmg, msi, deb, AppImage |

---

## License / 许可证

MIT - see [LICENSE](LICENSE)

## Acknowledgments / 致谢

- [Tauri](https://tauri.app/) · [React](https://react.dev/) · [Vite](https://vitejs.dev/)
- [sysinfo](https://github.com/GuillaumeGomez/sysinfo) · [i18next](https://www.i18next.com/) · [shadcn/ui](https://ui.shadcn.com/)

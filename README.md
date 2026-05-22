# Bench - DevTools / 开发者工具

> A cross-platform desktop utility for managing network ports, system info, app management, and dev cleanup.
> 跨平台桌面开发者工具：端口管理、系统信息、应用管理、开发垃圾清理。

Built with [Tauri v2](https://v2.tauri.app/) + [React 18](https://react.dev/) + [Rust](https://www.rust-lang.org/).

---

## Features / 功能

| Module / 模块 | Description / 描述 |
| :--- | :--- |
| **Port Manager / 端口管理** | Multi-format port input (single/range/comma), common port quick-add, live preview, kill processes with status feedback. 支持多种输入格式、常用端口一键添加、实时预览、结束进程并反馈状态。 |
| **System Info / 系统信息** | Native hardware & OS details via Rust backend (CPU, memory, kernel, hostname); browser fallback mode. 通过 Rust 后端获取原生系统详情，支持浏览器回退模式。 |
| **App Manager / 应用管理** | Cross-platform installed app discovery (macOS/Windows/Linux), source identification, batch upgrade/uninstall with safety gates. 跨平台应用发现、来源识别、批量升级/卸载及安全保护。 |
| **Dev Cleaner / 垃圾清理** | Scan workspace directories for build artifacts (`node_modules`, `target`, `.venv`, `dist`, etc.), batch cleanup. 扫描工作区目录中的构建产物，支持批量清理回收空间。 |
| **Hardware Compare / 硬件查询** | Query and compare hardware specifications across devices. 查询和对比不同设备的硬件规格。 |
| **Env Detector / 环境检测** | Detect installed development tools (runtimes, package managers, etc.). 检测已安装的开发工具和运行环境。 |
| **Auto Updater / 自动更新** | In-app version update with signature verification, progress tracking, and error recovery. 应用内版本更新，支持签名校验、进度跟踪和错误恢复。 |
| **Theme Switcher / 主题切换** | Light/Dark/System theme with instant switching. 浅色/深色/跟随系统主题，即时切换。 |
| **i18n / 国际化** | English & Simplified Chinese, instant switch without restart. 中英文双语，无需重启即时切换。 |

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
│   │   ├── common/                   # Shared dialogs & gate / 共享对话框与门控
│   │   │   ├── AboutDialog.tsx       # About dialog / 关于窗口
│   │   │   ├── UpdateDialog.tsx      # Update notification / 更新通知
│   │   │   ├── SettingsDialog.tsx    # Settings panel / 设置面板
│   │   │   ├── DesktopOnly.tsx       # Desktop-only guard / 桌面端守卫
│   │   │   └── RuntimeFeatureGate.tsx# Feature toggle gate / 功能开关守卫
│   │   ├── content/                  # Content views / 内容视图
│   │   │   ├── ContentView.tsx       # Multi-view layout / 多视图布局
│   │   │   ├── ViewToggle.tsx        # Table/Grid toggle / 表格/网格切换
│   │   │   ├── VirtualDataTable.tsx  # Virtualized table / 虚拟化表格
│   │   │   └── VirtualGridView.tsx   # Virtualized grid / 虚拟化网格
│   │   ├── layout/                   # Shell & navigation / 壳层与导航
│   │   │   ├── Sidebar.tsx           # Navigation sidebar / 侧边栏
│   │   │   ├── CustomTitlebar.tsx    # Custom window titlebar / 自定义标题栏
│   │   │   ├── ThreeColumnLayout.tsx # 3-column master-detail / 三栏布局
│   │   │   ├── DetailPanel.tsx       # Detail panel / 详情面板
│   │   │   ├── FilterPanel.tsx       # Filter sidebar / 筛选侧栏
│   │   │   ├── ThemeSwitcher.tsx     # Theme toggle / 主题切换
│   │   │   └── LanguageSwitcher.tsx  # Language toggle / 语言切换
│   │   └── ui/                       # shadcn/ui primitives / 基础 UI 组件
│   ├── data/                         # Hardware data sets / 硬件数据集
│   │   └── cpu.ts, gpu.ts, memory.ts, ssd.ts, phone.ts, ... (14 files)
│   ├── features/                     # Feature modules / 功能模块
│   │   ├── port-manager/             # Port kill / 端口管理
│   │   │   ├── components/, hooks/, services/
│   │   │   ├── feature.tsx, page.tsx, store.ts, ports.ts
│   │   ├── app-manager/              # App management / 应用管理
│   │   │   ├── components/, hooks/, model/, services/
│   │   │   ├── feature.tsx, page.tsx, store.ts
│   │   ├── system-info/              # System info / 系统信息
│   │   │   ├── hooks/, services/
│   │   │   ├── feature.tsx, page.tsx, store.ts
│   │   ├── dev-cleaner/              # Dev cleanup / 构建清理
│   │   │   ├── components/, hooks/, lib/, services/
│   │   │   ├── feature.tsx, page.tsx, store.ts
│   │   ├── env-detector/             # Environment detection / 环境检测
│   │   │   ├── hooks/, services/
│   │   │   ├── feature.tsx, page.tsx, store.ts
│   │   ├── hardware/                 # Hardware compare / 硬件对比
│   │   │   ├── HardwareCompare.tsx
│   │   │   ├── feature.tsx, page.tsx, store.ts
│   │   ├── updater/                  # App updater / 应用更新
│   │   │   ├── hooks/
│   │   │   ├── error-classifier.ts, store.ts
│   │   ├── refresh.ts                # Shared refresh logic / 共享刷新逻辑
│   │   ├── registry.tsx              # Feature registry / 功能注册表
│   │   └── types.ts                  # Shared feature types / 共享功能类型
│   ├── lib/                          # Shared libraries / 公共库
│   │   ├── tauri/                    # Tauri IPC bindings / IPC 绑定
│   │   │   ├── commands/             # Per-domain commands / 按域拆分
│   │   │   │   └── app-manager.ts, dev-cleaner.ts, env-detector.ts,
│   │   │   │       port-manager.ts, system-info.ts, updater.ts
│   │   │   ├── types/                # Per-domain types / 按域拆分类型
│   │   │   ├── commands.ts, contracts.ts, invoke.ts, types.ts
│   │   ├── utils.ts                  # Common utilities / 通用工具
│   │   └── i18nBrand.ts              # Brand name i18n / 品牌名国际化
│   ├── platform/                     # Platform abstractions / 平台抽象
│   │   ├── browser-info.ts           # Browser fallback info / 浏览器回退信息
│   │   ├── capabilities.ts           # Feature detection / 能力检测
│   │   ├── clipboard.ts              # Clipboard API / 剪贴板
│   │   ├── config.ts                 # Platform config / 平台配置
│   │   ├── dialog.ts                 # Native dialogs / 原生对话框
│   │   ├── events.ts                 # System events / 系统事件
│   │   ├── runtime.ts                # Runtime detection / 运行时检测
│   │   ├── shell.ts                  # Shell commands / 终端命令
│   │   └── storage.ts                # Local storage / 本地存储
│   ├── shared/                       # Shared components / 共享组件
│   │   ├── compare/                  # Compare UI / 对比界面
│   │   │   └── CompareMatrixTable, CompareTabs, FilterBar, ModelPicker, ...
│   │   └── context-menu/             # Right-click menus / 右键菜单
│   │       └── ContextMenuManager, GlobalContextMenu, ...
│   ├── i18n/                         # Internationalization / 国际化
│   │   └── locales/{en,zh}.json     # Language packs / 语言包
│   ├── hooks/                        # Shared hooks / 共享 hooks
│   │   └── useMenuEvents.ts          # Menu event handler / 菜单事件
│   ├── App.tsx                       # Root component with routing / 根组件
│   ├── main.tsx                      # Entry point / 入口
│   └── splash.ts                     # Splash screen logic / 启动屏逻辑
├── src-tauri/                        # Rust Backend / 后端
│   └── src/
│       ├── app_manager/              # Platform-specific app mgmt / 平台应用管理
│       │   ├── macos.rs, windows.rs, linux.rs
│       │   ├── commands.rs, domain.rs, operations.rs, state.rs, types.rs, utils.rs
│       ├── app_updater/              # App update commands / 应用更新
│       │   ├── commands.rs, mod.rs, types.rs
│       ├── dev_cleaner/              # Dev artifact cleaner / 构建产物清理
│       │   ├── cleanup.rs, core.rs, projects.rs, rules.rs, scanner.rs, sizing.rs, types.rs
│       ├── env_detector/             # Environment detection / 环境检测
│       │   ├── classification.rs, command_files.rs, core.rs, inventory.rs,
│       │   │   node_bins.rs, paths.rs, types.rs, version.rs
│       ├── port_manager/             # Port & system info / 端口与系统信息
│       │   ├── core.rs, fingerprints.rs, processes.rs, system_info.rs, types.rs
│       ├── bin/                      # Binary utilities / 二进制工具
│       │   └── verify_updater_manifest.rs
│       ├── commands.rs               # Command stubs / 命令桩
│       ├── lib.rs                    # Command registration / 命令注册
│       ├── main.rs                   # App entry / 应用入口
│       └── menu.rs                   # System menu / 系统菜单
├── scripts/                          # Build & release scripts / 构建与发布脚本
│   ├── generate-updater-json.mjs     # Updater manifest generation
│   ├── setup.mjs, write-updater-manifest.mjs
├── .github/workflows/ci-build.yml    # CI/CD pipeline
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

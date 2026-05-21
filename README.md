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
| **i18n / 国际化** | English & Simplified Chinese, instant switch without restart. 中英文双语，无需重启即时切换。 |

---

## Tech Stack / 技术栈

| Layer / 层 | Technology / 技术 |
| :--- | :--- |
| Desktop Framework | [Tauri v2](https://v2.tauri.app/) |
| Frontend / 前端 | [React 18](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/), [TailwindCSS 3](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) |
| Bundler / 构建 | [Vite 6](https://vitejs.dev/) |
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
├── src/                           # React Frontend / 前端
│   ├── components/
│   │   ├── features/              # Feature pages / 功能页面
│   │   │   ├── PortManager.tsx    # Port kill / 端口管理
│   │   │   ├── AppManager.tsx     # App management / 应用管理
│   │   │   ├── DevCleaner.tsx     # Dev cleanup / 垃圾清理
│   │   │   ├── SystemInfo.tsx     # System info / 系统信息
│   │   │   └── EnvDetector.tsx    # Environment detection / 环境检测
│   │   ├── layout/Sidebar.tsx     # Navigation sidebar / 侧边栏
│   │   └── ui/                    # Shared UI components / 通用 UI 组件
│   ├── features/app-manager/      # App Manager domain / 应用管理领域
│   ├── stores/app-manager.ts      # App Manager state (Zustand)
│   ├── lib/tauri/                 # Tauri IPC bindings / IPC 绑定
│   │   ├── commands.ts            # Command wrappers / 命令封装
│   │   └── types.ts               # Shared types / 共享类型
│   ├── i18n/                      # Internationalization / 国际化
│   │   └── locales/{en,zh}.json  # Language packs / 语言包
│   ├── App.tsx                    # Root component with routing / 根组件
│   └── main.tsx                   # Entry point / 入口
├── src-tauri/                     # Rust Backend / 后端
│   └── src/
│       ├── app_manager/           # Platform-specific app mgmt / 平台应用管理
│       │   ├── mod.rs, macos.rs, windows.rs, linux.rs
│       ├── port_manager.rs        # Port & system info / 端口与系统信息
│       ├── dev_cleaner.rs         # Dev artifact cleaner / 构建产物清理
│       ├── env_detector.rs        # Environment detection / 环境检测
│       └── lib.rs                 # Command registration / 命令注册
├── .github/workflows/ci-build.yml # CI/CD pipeline
└── package.json
```

---

## Configuration / 配置

Key settings in `src-tauri/tauri.conf.json`:

| Setting / 配置项 | Value / 值 |
| :--- | :--- |
| App ID | `com.bench.app` |
| Window Size / 窗口大小 | 960 × 680 (min 800 × 500) |
| Dev Server | `http://localhost:1420` |
| Bundle Targets / 打包目标 | dmg, msi, deb, AppImage |

---

## License / 许可证

MIT - see [LICENSE](LICENSE)

## Acknowledgments / 致谢

- [Tauri](https://tauri.app/) · [React](https://react.dev/) · [Vite](https://vitejs.dev/)
- [sysinfo](https://github.com/GuillaumeGomez/sysinfo) · [i18next](https://www.i18next.com/) · [shadcn/ui](https://ui.shadcn.com/)

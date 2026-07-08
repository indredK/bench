# Bench 架构指南

> **给 AI 代理看的** — 写代码或重构前必读，这是系统架构的唯一真实来源。
>
> 阅读顺序：**§1（上下文）** → **§2（禁止项）** → **§3（分层）** → **§4–6（按需查阅细节）**

---

## §1 系统上下文

Bench 是一个 **跨平台桌面工具**，用于 macOS 系统管理。它不是 Web 应用，也不是移动应用——它是一个 Tauri v2 桌面应用。

| 属性 | 值 |
|------|-----|
| 包名 | `com.bench.app` |
| 技术栈 | React 19 + TypeScript 5 strict + Vite + Tauri v2 (Rust) |
| 状态管理 | Zustand |
| 国际化 | i18next + react-i18next，中/英双语对等 |
| 窗口 | 1280×800，无边框，自定义标题栏，毛玻璃效果 |
| 目标系统 | macOS 为主，跨平台为辅 |

**仓库结构**：`src/`（React/TS 前端）+ `src-tauri/src/`（Rust 后端）

---

## §2 🔴 AI 编码规则 — 禁止模式

这些规则优先级高于一切。违反会导致运行时 Bug 或 CI 被拒。

1. **绝对不要在组件里直接调 Tauri `invoke()`** — 必须经过 `lib/tauri/commands/*` 的类型化封装 → controller hook → 组件。
2. **绝对不要把不带 selector 的 `useXxxStore()` 放进 hook 依赖里** — 会导致无限重渲染。异步读取用 `useXxxStore.getState()`，响应式读取用单独的 selector。
3. **绝对不要在业务代码里用 `typeof error === "string"` 或 `error instanceof Error`** — 用 `lib/tauri/errors.ts` 里的 `parseCommandError()` / `getErrorMessage()`。
4. **绝对不要在模块顶层、静态常量或 store 初始值里调 `t()`** — 翻译必须在渲染阶段 / `useMemo` 里计算。
5. **绝对不要在 JSX、toast 或菜单里硬编码中/英文字符串** — 所有用户可见文案都放在 `src/i18n/locales/{en,zh}.json`。
6. **绝对不要手动拼接 `className={`...`}`** — 用 `@/lib/utils` 里的 `cn()`。
7. **绝对不要新增命令却不同时更新 `contracts.ts` 和 `commands.rs`** — IPC 是双边契约。
8. **绝对不要用 `z-[N]` 魔法数字** — 用 `lib/ui-layers.ts` 里的 `UI_LAYERS` 或 `tokens.css` 里的 Tailwind 语义类。
9. **绝对不要在 IPC 命令路径上加 `.expect()` 或 `.unwrap()`** — 所有错误都必须返回 `AppResult<T>`。
10. **绝对不要把业务逻辑写在 `store.ts` 里** — 只放状态 + 简单 setter。复杂逻辑放 `*use-cases.ts`。

---

## §3 分层架构

### 3.1 分层地图

```
src/main.tsx                           # 启动入口（i18n 就绪 → 渲染）
  └─ App.tsx                           # 外壳：路由 + 布局 + 全局弹窗
      ├─ CustomTitlebar                 # 无边框窗口装饰条
      ├─ Sidebar                        # 导航（200px）
      ├─ AnimatedRoutes                 # wouter <Switch> + AnimatePresence
      │   └─ Feature Panel              # 每个路由懒加载
      └─ Global Dialogs                 # 关于、设置、关闭行为、更新

功能模块（按领域）：
  feature.tsx     → AppFeature 描述符 + lazy()
  page.tsx        → 视图组合（尽量薄）
  hooks/*.ts      → useXxxController — 连接 store ↔ use-cases
  services/       → *.use-cases.ts（编排） + *.repository.ts（适配）
  store.ts        → Zustand：只管状态 + 简单 setter
  components/     → 功能私有 UI 组件
  __tests__/      → 同位置测试

共享层：
  components/ui/     → shadcn/ui 基础组件（button, dialog, select...）
  components/layout/ → ThreeColumnLayout, FilterPanel, DetailPanel
  components/common/ → DestructiveConfirmDialog, RuntimeFeatureGate, DesktopOnly
  components/content/→ VirtualGridView, VirtualDataTable, ViewToggle

平台边界（src/platform/）：
  runtime.ts       → isDesktopRuntime()（检测是否 Tauri 环境）
  capabilities.ts  → canUseDesktopFeatures(), canUseTauriCommands()...
  config.ts        → 平台名称检测 + 各系统配置
  events.ts        → Tauri 事件监听/触发（带浏览器降级）
  window.ts        → getCurrentAppWindow（带重试）
  dialog.ts        → openPlatformDialog / savePlatformDialog
  shell.ts         → openExternal
  storage.ts       → readStorageItem / writeStorageItem（localStorage 降级）

IPC 契约（src/lib/tauri/）：
  contracts.ts     → TAURI_COMMAND_CONTRACTS + TAURI_COMMANDS + TAURI_EVENTS
  invoke.ts        → invokeTauriCommand() 类型化封装
  commands/*.ts    → 按领域划分的类型化命令函数
  types/*.ts       → DTO 类型（与 Rust struct 对应）
  errors.ts        → parseCommandError / getErrorMessage / translateError

Rust 后端（src-tauri/src/）：
  main.rs          → bench_lib::run()
  lib.rs           → tauri::Builder：插件、状态、初始化、invoke_handler
  commands.rs      → 宏生成的 generate_handler![...]
  error.rs         → AppError { code, message } + AppResult<T>
  <domain>/        → commands.rs + types.rs + <domain>.rs（业务逻辑）
```

### 3.2 数据流：用户操作 → UI 更新

```
用户点击
  → page.tsx 的 handler 调用 controller.run()
    → controller 调用 useCase.execute()
      → useCase 调用 repository.fetch()
        → repository 调 lib/tauri/commands/*.ts 里的函数
          → invokeTauriCommand() 类型化封装
            → @tauri-apps/api/core 的 invoke()
              → Rust 的 #[tauri::command] 异步函数
                → 阻塞 I/O 用 spawn_blocking 隔离
                  → 返回 AppResult<T>
            ← 出错时由 parseCommandError() 解析
      ← useCase 将 DTO 转成领域模型
    ← controller 通过 getState().setXxx() 更新 store
  ← React 通过 zustand selector 订阅触发重渲染
```

### 3.3 状态流：数据 → UI

```
Rust（系统信息、plist、文件扫描）
  → IPC JSON 序列化（serde）
  → 前端类型化 DTO（lib/tauri/types/*）
  → useCase 的 mapToDomain() 转换
  → Store（zustand）— 扁平状态 + setter
  → Controller 的 selector 订阅
  → 组件渲染
```

---

## §4 IPC 契约系统

IPC 层是架构的核心。它必须在 TS↔Rust 边界上保持同步。

### 4.1 契约链路

```
TAURI_COMMAND_CONTRACTS（contracts.ts）
  ├── 定义每条命令的参数/返回类型
  ├── 编译期检查：命令名 = key 名
  ├── TAURI_COMMANDS（按领域分组）
  │   └── 编译期检查：所有契约都出现在分组里
  └── TAURI_COMMAND_ARG_KEYS
      └── 测试期检查：与 Rust 函数参数匹配

lib/tauri/commands/*.ts  — 导入契约的类型化封装
lib/tauri/types/*.ts     — 与 Rust struct 对应的 DTO
src-tauri/src/commands.rs — 所有 #[tauri::command] 在这里注册
src-tauri/src/<domain>/  — 命令实现
```

### 4.2 新增命令（检查清单）

- [ ] Rust：在 `<domain>/commands.rs` 里加 `#[tauri::command]`
- [ ] Rust：在 `commands.rs` 宏里注册
- [ ] TS：在 `contracts.ts` 里用 `defineTauriCommand` 加契约
- [ ] TS：加到 `TAURI_COMMANDS` 分组映射里
- [ ] TS：在 `lib/tauri/commands/<domain>.ts` 加类型化封装
- [ ] TS：如果有新结构体返回，加 DTO 类型
- [ ] 测试：如有需要，更新 `lib/tauri/__tests__/contracts.test.ts`

---

## §5 目录源码地图（供 AI 文件导航用）

```
src/
├── App.tsx                          # 外壳、路由、全局弹窗
├── main.tsx                         # 启动入口 + 提供者
├── components/
│   ├── ui/                          # shadcn/ui — 25+ 基础组件
│   ├── layout/                      # ThreeColumnLayout, Sidebar, FilterPanel, DetailPanel
│   ├── common/                      # DestructiveConfirmDialog, RuntimeFeatureGate, UpdateDialog
│   └── content/                     # VirtualGridView, VirtualDataTable, ViewToggle
├── features/                        # 11 个领域模块
│   ├── account-manager/             # 会话、webview、认证代理（复杂）
│   ├── app-manager/                 # 已安装应用扫描、启动、卸载
│   ├── clean-space/                # 存储空间清理（顶层主菜单模块；含开发项目清理子流程）
│   ├── dev-cleaner/                 # 清理引擎（被 clean-space 复用，不再独立注册）
│   ├── dev-toolbox/                 # Tab 容器 — 聚合端口管理、环境检测、Token 计算
│   ├── env-detector/                # 开发工具清单
│   ├── hardware/                    # 硬件对比（手机、CPU、GPU...）
│   ├── port-manager/                # 端口扫描与查杀（参考范例）
│   ├── quick-launch/                # 快速应用启动
│   ├── system-settings/             # macOS 系统设置（外观、安全、系统）
│   ├── terminology/                 # 开发术语增删改查
│   ├── token-calculator/            # AI Token 计费计算器
│   └── updater/                     # 应用更新机制
├── hooks/                           # 共享 hooks（useGuardedAsync, useMenuEvents...）
├── platform/                        # Tauri 抽象层
├── lib/
│   ├── tauri/
│   │   ├── contracts.ts             # IPC 契约定义
│   │   ├── invoke.ts                # 类型化 invoke 封装
│   │   ├── commands/                # 领域命令函数（14 个文件）
│   │   ├── types/                   # DTO 类型定义（11 个文件）
│   │   └── errors.ts                # 错误解析与翻译
│   ├── utils.ts                     # cn(), retry() 等
│   └── ui-layers.ts                 # z-index 常量
├── i18n/
│   ├── config.ts                    # i18next 初始化
│   └── locales/{en,zh}.json        # 翻译资源
├── data/                            # 硬件静态数据（12 个文件，约 2200 行）
└── shared/                          # 跨功能共享逻辑

src-tauri/src/
├── main.rs                          # 二进制入口
├── lib.rs                           # Builder：插件 + 状态 + 初始化 + invoke_handler
├── commands.rs                      # 宏注册的处理器列表（约 90 条命令）
├── error.rs                         # AppError + AppResult<T>
├── account_manager/                 # OAuth、会话、webview
├── app_manager/                     # 应用扫描、启动、卸载
├── app_preferences/                 # 关闭行为
├── app_updater/                     # 签名更新器
├── bootstrap/                       # 启动就绪追踪
├── dev_cleaner/                     # 项目扫描
├── env_detector/                    # 工具清单
├── file_ops.rs                      # 文件操作
├── menu.rs                          # 应用菜单
├── port_manager/                    # 端口扫描与查杀
├── sleep_inhibitor/                 # 防睡眠（caffeinate）
├── system_settings/                 # macOS defaults
├── terminology/                     # 术语存储
├── token_calculator/                # 定价标准
├── tray.rs                          # 菜单栏托盘
└── window_theme/                    # 窗口外观
```

---

## §6 错误处理策略

### 6.1 错误流

```
Rust：Result<T, AppError> { code: "大写下划线命名", message: "..." }
  → Tauri 做 JSON 序列化
  → JS catch 块收到未知形状的数据
  → parseCommandError(error) → AppErrorShape { code, message }
  → getErrorMessage(error) → string
  → translateError(t, error) → 本地化字符串（先试 errors.<CODE>，不行就回退到 message）
```

### 6.2 文件职责

| 文件 | 角色 |
|------|------|
| `src-tauri/src/error.rs` | 定义 `AppError` + `AppResult<T>` + 工厂方法 |
| `src/lib/tauri/errors.ts` | 前端错误解析：`parseCommandError`、`getErrorMessage`、`translateError` |
| `src/lib/errors.ts` | 前端错误类型：`LocalizedError` |
| `src/lib/tauri/__tests__/errors.test.ts` | 错误解析单元测试 |

### 6.3 错误码列表

| 错误码 | 含义 | 来源 |
|--------|------|------|
| `INTERNAL` | 意外的内部错误 | Rust 通用 |
| `INVALID_INPUT` | 用户输入被拒绝 | Rust 校验 |
| `NOT_FOUND` | 资源未找到 | Rust 查找操作 |
| `UNSUPPORTED` | 当前平台不支持此操作 | Rust 平台检测 |
| `IO_ERROR` | 文件系统 I/O 失败 | Rust I/O |
| `FORBIDDEN_PATH` | 不允许的文件路径 | Rust 安全检查 |
| `TASK_FAILED` | 后台任务失败 | Rust spawn_blocking |

---

## §7 配置文件地图

| 文件 | 用途 |
|------|------|
| `tauri.conf.json` | Tauri 窗口、包、更新器、CSP、深度链接 |
| `vite.config.ts` | Vite 插件、别名、构建分包、vitest 配置 |
| `tsconfig.json` | TypeScript strict 模式、`@/` 别名 |
| `package.json` | 脚本、依赖、pnpm 配置 |
| `components.json` | shadcn/ui 配置 |
| `.release-please-manifest.json` | 自动版本号 |

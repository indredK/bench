# Bench Architecture Guide

> **For AI Agents** — Read this before any code generation or refactoring. This is the single source of truth for system architecture.
>
> Consume order: **§1 (Context)** → **§2 (Forbidden)** → **§3 (Layers)** → **§4–6 (Details on demand)**

---

## §1 System Context

Bench is a **cross-platform desktop utility** for macOS system management. It is NOT a web app, NOT a mobile app — it is a Tauri v2 desktop application.

| Attribute | Value |
|-----------|-------|
| Identifier | `com.bench.app` |
| Tech Stack | React 19 + TypeScript 5 strict + Vite + Tauri v2 (Rust) |
| State | Zustand |
| i18n | i18next + react-i18next, zh/en parity |
| Window | 1280x800, frameless, custom titlebar, vibrancy |
| OS Target | macOS primary, cross-platform secondary |

**Repository**: `src/` (React/TS frontend) + `src-tauri/src/` (Rust backend)

---

## §2 🔴 AI Coding Rules — Forbidden Patterns

These override all other considerations. Violations cause runtime bugs or CI rejection.

1. **Never put Tauri `invoke()` calls directly in components** — must go through `lib/tauri/commands/*` typed wrappers → controller hook → component.
2. **Never put `useXxxStore()` without selector in hook dependencies** — causes infinite re-renders. Use `useXxxStore.getState()` for async reads, individual selectors for reactive reads.
3. **Never use `typeof error === "string"` or `error instanceof Error` in feature code** — use `parseCommandError()` / `getErrorMessage()` from `lib/tauri/errors.ts`.
4. **Never call `t()` at module top level, static constants, or store initializers** — translations must be computed in render phase / `useMemo`.
5. **Never hardcode Chinese/English strings in JSX, toasts, or menus** — all user-facing text goes to `src/i18n/locales/{en,zh}.json`.
6. **Never use `className={`...`}` with manual concatenation** — use `cn()` from `@/lib/utils`.
7. **Never add new commands without updating both** `contracts.ts` AND `commands.rs` — IPC is a two-sided contract.
8. **Never use `z-[N]` magic numbers** — use `UI_LAYERS` from `lib/ui-layers.ts` or Tailwind semantic classes from `tokens.css`.
9. **Never add `.expect()` or `.unwrap()` in IPC command paths** — all errors must return `AppResult<T>`.
10. **Never put business logic in `store.ts`** — only state + simple setters. Complex logic goes in `*use-cases.ts`.

---

## §3 Layered Architecture

### 3.1 Layer Map

```
src/main.tsx                           # Bootstrap (i18n ready → render)
  └─ App.tsx                           # Shell: router + layout + global dialogs
      ├─ CustomTitlebar                 # Frameless window chrome
      ├─ Sidebar                        # Navigation (200px)
      ├─ AnimatedRoutes                 # wouter <Switch> + AnimatePresence
      │   └─ Feature Panel              # Lazy-loaded per route
      └─ Global Dialogs                 # About, Settings, CloseBehavior, Update

Feature (per domain):
  feature.tsx     → AppFeature descriptor + lazy()
  page.tsx        → View composition (thin)
  hooks/*.ts      → useXxxController — wires store ↔ use-cases
  services/       → *.use-cases.ts (orchestration) + *.repository.ts (adapter)
  store.ts        → Zustand: state + simple setters only
  components/     → Feature-private UI
  __tests__/      → Co-located tests

Shared:
  components/ui/     → shadcn/ui primitives (button, dialog, select...)
  components/layout/ → ThreeColumnLayout, FilterPanel, DetailPanel
  components/common/ → DestructiveConfirmDialog, RuntimeFeatureGate, DesktopOnly
  components/content/→ VirtualGridView, VirtualDataTable, ViewToggle

Platform Boundary (src/platform/):
  runtime.ts       → isDesktopRuntime() (isTauri() check)
  capabilities.ts  → canUseDesktopFeatures(), canUseTauriCommands()...
  config.ts        → platformName detection + per-OS configs
  events.ts        → Tauri event listeners/emitters (with browser fallback)
  window.ts        → getCurrentAppWindow (with retry)
  dialog.ts        → openPlatformDialog / savePlatformDialog
  shell.ts         → openExternal
  storage.ts       → readStorageItem / writeStorageItem (localStorage fallback)

IPC Contracts (src/lib/tauri/):
  contracts.ts     → TAURI_COMMAND_CONTRACTS + TAURI_COMMANDS + TAURI_EVENTS
  invoke.ts        → invokeTauriCommand() typed wrapper
  commands/*.ts    → Domain-specific typed command functions
  types/*.ts       → DTO types (mirroring Rust structs)
  errors.ts        → parseCommandError / getErrorMessage / translateError

Rust Backend (src-tauri/src/):
  main.rs          → bench_lib::run()
  lib.rs           → tauri::Builder: plugins, state, setup, invoke_handler
  commands.rs      → macro-generated generate_handler![...]
  error.rs         → AppError { code, message } + AppResult<T>
  <domain>/        → commands.rs + types.rs + <domain>.rs (business logic)
```

### 3.2 Data Flow: User Action → UI Update

```
User Click
  → page.tsx handler calls controller.run()
    → controller calls useCase.execute()
      → useCase calls repository.fetch()
        → repository calls lib/tauri/commands/*.ts function
          → invokeTauriCommand() typed wrapper
            → invoke() from @tauri-apps/api/core
              → Rust #[tauri::command] async fn
                → spawn_blocking for blocking I/O
                  → AppResult<T> returned
            ← parsed by parseCommandError() on error
      ← useCase transforms DTO → domain model
    ← controller updates store via getState().setXxx()
  ← React re-renders via zustand selector subscription
```

### 3.3 State Flow: Data → UI

```
Rust (sysinfo, plist, file scan)
  → IPC JSON serialize (serde)
  → Frontend typed DTO (lib/tauri/types/*)
  → useCase mapToDomain() transforms
  → Store (zustand) — flat state + setters
  → Controller selector subscription
  → Component render
```

---

## §4 IPC Contract System

The IPC layer is the architectural crown jewel. It must remain synchronized across the TS↔Rust boundary.

### 4.1 Contract Chain

```
TAURI_COMMAND_CONTRACTS (contracts.ts)
  ├── defines every command with typed args/result
  ├── compile-time check: command name = key name
  ├── TAURI_COMMANDS (grouped by domain)
  │   └── compile-time check: all contracts appear in groups
  └── TAURI_COMMAND_ARG_KEYS
      └── test-time check: matches Rust function params

lib/tauri/commands/*.ts  — typed wrappers that import contracts
lib/tauri/types/*.ts     — DTOs matching Rust structs
src-tauri/src/commands.rs — all #[tauri::command] registered here
src-tauri/src/<domain>/  — command implementations
```

### 4.2 Adding a New Command (Checklist)

- [ ] Rust: `#[tauri::command]` in `<domain>/commands.rs`
- [ ] Rust: Register in `commands.rs` macro
- [ ] TS: Add contract in `contracts.ts` with `defineTauriCommand`
- [ ] TS: Add to `TAURI_COMMANDS` grouped map
- [ ] TS: Add typed wrapper in `lib/tauri/commands/<domain>.ts`
- [ ] TS: Add DTO types if new structures are returned
- [ ] Test: Update `lib/tauri/__tests__/contracts.test.ts` if needed

---

## §5 Directory Source Map (for AI File Navigation)

```
src/
├── App.tsx                          # Shell, router, global dialogs
├── main.tsx                         # Bootstrap + providers
├── components/
│   ├── ui/                          # shadcn/ui — 25+ primitives
│   ├── layout/                      # ThreeColumnLayout, Sidebar, FilterPanel, DetailPanel
│   ├── common/                      # DestructiveConfirmDialog, RuntimeFeatureGate, UpdateDialog
│   └── content/                     # VirtualGridView, VirtualDataTable, ViewToggle
├── features/                        # 11 domain modules
│   ├── account-manager/             # Sessions, webview, auth proxy (complex)
│   ├── app-manager/                 # Installed app scan, launch, uninstall
│   ├── dev-cleaner/                 # Project waste scan & cleanup
│   ├── dev-toolbox/                 # Tab hub — wraps port-manager, dev-cleaner, env-detector, token-calculator
│   ├── env-detector/               # Dev tool inventory
│   ├── hardware/                    # Hardware compare (phone, CPU, GPU...)
│   ├── port-manager/                # Port scan & kill (reference pattern)
│   ├── quick-launch/               # Quick app launcher
│   ├── system-settings/            # macOS system settings (appearance, security, system)
│   ├── terminology/                 # Dev term CRUD
│   ├── token-calculator/           # AI token pricing calculator
│   └── updater/                     # App update mechanism
├── hooks/                           # Shared hooks (useGuardedAsync, useMenuEvents...)
├── platform/                        # Tauri abstraction layer
├── lib/
│   ├── tauri/
│   │   ├── contracts.ts             # IPC contract definitions
│   │   ├── invoke.ts                # Typed invoke wrapper
│   │   ├── commands/                # Domain command functions (14 files)
│   │   ├── types/                   # DTO type definitions (11 files)
│   │   └── errors.ts                # Error parsing & translation
│   ├── utils.ts                     # cn(), retry(), etc.
│   └── ui-layers.ts                 # z-index constants
├── i18n/
│   ├── config.ts                    # i18next init
│   └── locales/{en,zh}.json        # Translation resources
├── data/                            # Static hardware data (12 files, ~2200 lines)
└── shared/                          # Cross-feature shared logic

src-tauri/src/
├── main.rs                          # Binary entry
├── lib.rs                           # Builder: plugins + state + setup + invoke_handler
├── commands.rs                      # Macro-registered handler list (~90 commands)
├── error.rs                         # AppError + AppResult<T>
├── account_manager/                 # OAuth, sessions, webview
├── app_manager/                     # App scan, launch, uninstall
├── app_preferences/                 # Close behavior
├── app_updater/                     # Signed updater
├── bootstrap/                       # Startup readiness tracking
├── dev_cleaner/                     # Project scan
├── env_detector/                    # Tool inventory
├── file_ops.rs                      # File operations
├── menu.rs                          # App menu
├── port_manager/                    # Port scan & kill
├── sleep_inhibitor/                 # Caffeinate
├── system_settings/                 # macOS defaults
├── terminology/                     # Term storage
├── token_calculator/                # Pricing standards
├── tray.rs                          # Menu bar tray
└── window_theme/                    # Window appearance
```

---

## §6 Error Handling Strategy

### 6.1 Error Flow

```
Rust: Result<T, AppError> { code: "SCREAMING_SNAKE_CASE", message: "..." }
  → JSON serialized by Tauri
  → JS catch block receives unknown shape
  → parseCommandError(error) → AppErrorShape { code, message }
  → getErrorMessage(error) → string
  → translateError(t, error) → localized string (tries errors.<CODE>, falls back to message)
```

### 6.2 File Responsibilities

| File | Role |
|------|------|
| `src-tauri/src/error.rs` | Defines `AppError` + `AppResult<T>` + factory methods |
| `src/lib/tauri/errors.ts` | Frontend error parsing: `parseCommandError`, `getErrorMessage`, `translateError` |
| `src/lib/errors.ts` | Frontend error types: `LocalizedError` |
| `src/lib/tauri/__tests__/errors.test.ts` | Error parsing unit tests |

### 6.3 Error Code List

| Code | Meaning | Source |
|------|---------|--------|
| `INTERNAL` | Unexpected internal error | Rust generic |
| `INVALID_INPUT` | User input rejected | Rust validation |
| `NOT_FOUND` | Resource not found | Rust find ops |
| `UNSUPPORTED` | Operation not supported on this platform | Rust platform check |
| `IO_ERROR` | File system I/O failure | Rust I/O |
| `FORBIDDEN_PATH` | Disallowed file path | Rust security check |
| `TASK_FAILED` | Background task failure | Rust spawn_blocking |

---

## §7 Configuration Source Map

| File | Purpose |
|------|---------|
| `tauri.conf.json` | Tauri window, bundle, updater, CSP, deep-link |
| `vite.config.ts` | Vite plugins, aliases, build chunks, vitest config |
| `tsconfig.json` | TypeScript strict mode, `@/` alias |
| `package.json` | Scripts, dependencies, pnpm config |
| `components.json` | shadcn/ui config |
| `.release-please-manifest.json` | Auto-versioning |

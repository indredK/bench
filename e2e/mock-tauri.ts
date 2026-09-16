/**
 * Mock Tauri IPC / IPC 桩 (GAP-TO-2.0 A4-1)。
 *
 * 在应用代码运行前注入 `window.__TAURI_INTERNALS__`, 让 e2e 在纯浏览器环境
 * 渲染前端状态矩阵 (loading / empty / failed / partial / cancelled / 长文本),
 * 不依赖桌面后端。所有 invoke 调用按命令名路由到 `handlers` 中的固定数据;
 * 未注册的命令返回 `{}`, 事件监听 (plugin:event|listen) 返回空 unlisten。
 */
import type { Page, TestInfo } from "@playwright/test"

export type InvokeHandlers = Record<string, unknown | ((args: unknown) => unknown)>

export function installMockTauri(handlers: InvokeHandlers) {
  return JSON.stringify(handlers)
}

export async function gotoWithMockedTauri(
  page: Page,
  path: string,
  options: { handlers?: InvokeHandlers; language?: "zh" | "en" } = {},
) {
  const handlers = options.handlers ?? {}
  const explicitLanguage = options.language ?? null
  await page.addInitScript(
    ({ mockedHandlers, lang }: { mockedHandlers: InvokeHandlers; lang: string | null }) => {
      // addInitScript 的参数会跨序列化边界 —— 函数会静默丢失。延迟/拒绝行为
      // 用标记对象编码（__mockDelay / __mockReject），在这里解释执行。
      const runMock = (handler: unknown, args: unknown): unknown => {
        if (handler && typeof handler === "object" && "__mockReject" in handler) {
          const spec = handler.__mockReject as { code: string; message: string; afterMs?: number }
          return new Promise((_, reject) =>
            setTimeout(() => reject({ code: spec.code, message: spec.message }), spec.afterMs ?? 0),
          )
        }
        if (handler && typeof handler === "object" && "__mockDelay" in handler) {
          return new Promise((resolve) => setTimeout(resolve, (handler.__mockDelay as number) ?? 0))
        }
        return handler
      }
      const invoke = async (cmd: string, args?: unknown) => {
        const handler = mockedHandlers[cmd]
        if (handler === undefined) {
          console.warn(`[mock-tauri] unmocked command: ${cmd}`)
          return {}
        }
        return runMock(handler, args)
      }
      const internals = {
        transformCallback: (callback: unknown) => String(Math.abs(Math.random() * 1e9)),
        invoke,
        isTauri: true,
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
        plugins: {},
      }
      ;(window as Record<string, unknown>).__TAURI_INTERNALS__ = internals
      ;(window as Record<string, unknown>).__TAURI__ = { core: { invoke } }
      // @tauri-apps/api 的 isTauri() 读 globalThis.isTauri；缺了它运行时判定为
      // 非 desktop，desktopOnly 功能全被 gate（存量 15/17 用例失败的根因）。
      ;(window as Record<string, unknown>).isTauri = true
      // @tauri-apps/api/event 的 _unlisten 依赖事件插件内部表；缺了它任何
      // listen() 的清理路径都会抛 `unregisterListener of undefined` 并打崩
      // React 渲染树（剩余 13 例空白页的根因）。
      ;(window as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: () => {},
        registerListener: () => {},
      }
      // 语言注入：显式指定时固定写入（确定性）；未指定时尊重已持久化的值，
      // 只在缺失时回落 zh —— 否则 reload 类测试里手工 setItem('en') 会被
      // init 脚本重新覆盖回 zh（语言切换用例失败的根因）。
      const existing = localStorage.getItem("language")
      localStorage.setItem("language", lang ?? existing ?? "zh")
    },
    { mockedHandlers: handlers, lang: explicitLanguage },
  )
  // 应用使用 hash 路由（src/App.tsx 的 useHashLocation）：直接 `goto("/account-manager")`
  // 会落在默认路由上，断言全部找不到元素（历史遗留的 e2e 漂移，本批修正）。
  const hashPath = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : `/${path}`}`
  await page.goto(hashPath)
}

export function screenshotName(path: string, testInfo: TestInfo, suffix: string) {
  return `${path.replace(/^\//, "").replace(/\//g, "-")}-${testInfo.project.name}-${suffix}.png`
}

/** 通用的最小账号管理 IPC 桩: 三栏布局 + partial 能力横幅。 */
export const accountManagerHandlers = {
  get_account_manager_capabilities: {
    platform: "macos",
    credentialStore: { status: "supported" },
    isolatedWebview: { status: "supported" },
    cookieSession: { status: "supported" },
    webStorage: { status: "supported" },
    indexedDb: { status: "supported" },
    networkProxy: { status: "partial" },
    deepLink: { status: "supported" },
    // I1/I2/I3 互通能力（page.tsx 的 capabilityState 会读 .status，缺失即崩页）。
    browserSessionOpen: { status: "supported" },
    browserSessionCapture: { status: "supported" },
    browserSessionExtension: { status: "supported" },
  },
  list_stations: [],
  list_all_accounts: [],
}

/** 常规命令名映射所需的最小 app-manager IPC 桩 (空列表 → empty 态)。 */
export const emptyAppManagerHandlers = {
  scan_installed_apps: {
    apps: [],
    totalCount: 0,
    userCount: 0,
    systemCount: 0,
    scanTimeMs: 1,
    managedCount: 0,
    platformCapabilities: {
      brewAvailable: false,
      wingetAvailable: false,
      flatpakAvailable: false,
      snapAvailable: false,
      aptAvailable: false,
    },
    lastScanTime: 1,
    lastUpdateCheck: 0,
    revision: 1,
    complete: true,
    providers: [],
    warnings: [],
    schemaVersion: 1,
  },
  get_cached_app_inventory: null,
  check_all_app_updates: {
    updates: [],
    providers: [],
    checkedAt: 0,
    complete: true,
    inventoryRevision: 1,
  },
  get_current_app_version: "1.28.0",
}

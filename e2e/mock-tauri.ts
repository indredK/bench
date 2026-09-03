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
  const language = options.language ?? "zh"
  await page.addInitScript(
    ({ mockedHandlers, lang }: { mockedHandlers: InvokeHandlers; lang: string }) => {
      const invoke = async (cmd: string, args?: unknown) => {
        const handler = mockedHandlers[cmd]
        if (handler === undefined) {
          console.warn(`[mock-tauri] unmocked command: ${cmd}`)
          return {}
        }
        return typeof handler === "function" ? (handler as (a: unknown) => unknown)(args) : handler
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
      localStorage.setItem("language", lang)
    },
    { mockedHandlers: handlers, lang: language },
  )
  await page.goto(path)
}

export function screenshotName(path: string, testInfo: TestInfo, suffix: string) {
  return `${path.replace(/^\//, "").replace(/\//g, "-")}-${testInfo.project.name}-${suffix}.png`
}

/** 通用的最小账号管理 IPC 桩: 三栏布局 + partial 能力横幅。 */
export const accountManagerHandlers = {
  get_account_manager_capabilities: {
    credentialStore: { status: "supported" },
    isolatedWebview: { status: "supported" },
    cookieSession: { status: "supported" },
    webStorage: { status: "supported" },
    indexedDb: { status: "supported" },
    networkProxy: { status: "partial" },
    deepLink: { status: "supported" },
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

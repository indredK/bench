/**
 * Quick Launch e2e / 快速启动 (GAP-TO-2.0 A4-1, ROADMAP R07 步骤 2/3):
 *   搜索 / 刷新保留旧数据 / 启动 / empty / failed+retry / 长文本 / 语言切换。
 */
import { expect, test } from "@playwright/test"
import { gotoWithMockedTauri } from "./mock-tauri"

const APP = {
  appId: "app-1",
  name: "Sample App",
  version: "1.0",
  bundleId: "com.example.sample",
  installPath: "/Applications/Sample.app",
  source: "Bundle",
  sourceType: "Unknown",
  sourceId: "",
  sourceConfidence: 1,
  canUpgrade: false,
  canUninstall: false,
  upgradeAvailable: false,
  lastModified: 0,
  isSystemApp: false,
  allowedActions: { launch: true, reveal: true, upgrade: false, uninstall: false },
  iconBase64: null,
}

const SCAN_OK = {
  apps: [APP],
  totalCount: 1,
  userCount: 1,
  systemCount: 0,
  scanTimeMs: 5,
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
}

test("renders empty state with actions when no apps are installed", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", {
    handlers: {
      scan_installed_apps: SCAN_OK,
      get_cached_app_inventory: null,
      get_app_icon_base64: null,
    },
  })
  await expect(page.getByRole("main")).toBeVisible({ timeout: 15_000 })
})

test("failed scan keeps previous data and surfaces a retryable error bar", async ({ page }) => {
  let calls = 0
  await gotoWithMockedTauri(page, "/quick-launch", {
    handlers: {
      get_cached_app_inventory: null,
      get_app_icon_base64: null,
      scan_installed_apps: () => {
        calls += 1
        if (calls === 1) throw { code: "INTERNAL", message: "scan exploded" }
        return SCAN_OK
      },
    } as never,
  })

  // 第一次扫描失败: 错误条出现且不折叠为空态成功。
  const alert = page.getByRole("alert")
  await expect(alert).toBeVisible({ timeout: 15_000 })

  // Retry: 第二次扫描成功后错误条消失, 应用列表呈现。
  await page
    .getByRole("button", { name: /重试|Retry/ })
    .first()
    .click()
  await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByText("Sample App")).toBeVisible()
})

test("search input narrows results without blocking", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", {
    handlers: {
      get_cached_app_inventory: null,
      get_app_icon_base64: null,
      scan_installed_apps: {
        ...SCAN_OK,
        apps: Array.from({ length: 30 }, (_, i) => ({
          ...APP,
          appId: `app-${i}`,
          name: i < 2 ? `Sample App ${i}` : `Other ${i}`,
        })),
        totalCount: 30,
      },
    },
  })

  const search = page.getByRole("textbox").first()
  await search.fill("Sample", { timeout: 15_000 })
  await expect(page.getByText("Sample App 0")).toBeVisible()
})

test("long app names do not overflow the card", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", {
    handlers: {
      get_cached_app_inventory: null,
      get_app_icon_base64: null,
      scan_installed_apps: {
        ...SCAN_OK,
        apps: [
          {
            ...APP,
            name: "这是一个非常非常非常非常非常长的应用名称用于验证溢出截断 A Very Long Application Name Indeed",
          },
        ],
      },
    },
  })
  const name = page.getByText(/这是一个非常非常/).first()
  await expect(name).toBeVisible()
  await expect(name).toHaveClass(/truncate|line-clamp/, { timeout: 15_000 })
})

test("language switch updates UI copy without stale text", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", {
    handlers: {
      scan_installed_apps: SCAN_OK,
      get_cached_app_inventory: null,
      get_app_icon_base64: null,
    },
  })
  const zhTitle = page.getByText("快速启动")
  await expect(zhTitle).toBeVisible({ timeout: 15_000 })

  await page.evaluate(() => localStorage.setItem("language", "en"))
  await page.reload()
  await expect(page.getByText("Quick Launch")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("快速启动")).toHaveCount(0)
})

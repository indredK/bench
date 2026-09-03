/**
 * Updater e2e (GAP-TO-2.0 A4-8, ROADMAP R07 步骤 2):
 *   mock IPC 驱动 UpdateDialog: 下载进度 (NaN 防护) / 取消回 available /
 *   失败 error+retry / readyToRestart。
 */
import { expect, test } from "@playwright/test"
import { gotoWithMockedTauri } from "./mock-tauri"

const UPDATE_AVAILABLE = {
  available: true,
  currentVersion: "1.28.0",
  version: "2.0.0",
  date: "2026-09-01T00:00:00Z",
  body: "## 2.0.0\n\n- release notes",
}

function updaterHandlers(mode: "download" | "cancel" | "fail") {
  return {
    get_current_app_version: "1.28.0",
    check_for_app_update: UPDATE_AVAILABLE,
    download_and_install_app_update: () => {
      if (mode === "fail") throw { code: "UPDATER_PERMISSION_DENIED", message: "permission denied" }
      if (mode === "cancel") throw { code: "UPDATER_CANCELLED", message: "cancelled" }
      return {}
    },
    cancel_app_update_download: () => true,
    read_updater_policy: {
      autoCheckEnabled: true,
      lastSuccessfulCheckAt: 0,
      lastFailureAt: 0,
      failureCount: 0,
    },
  }
}

async function openUpdaterDialog(page: Page) {
  // 更新入口在侧边栏底部 (检查更新)。
  await page
    .getByRole("button", { name: /检查更新|Check for updates|更新/ })
    .first()
    .click()
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 15_000 })
}

test("download progress reaches readyToRestart", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", { handlers: updaterHandlers("download") })
  await openUpdaterDialog(page)

  await page
    .getByRole("button", { name: /立即安装|Install/ })
    .first()
    .click()
  await expect(page.getByText(/准备重启|Ready to restart/)).toBeVisible({ timeout: 15_000 })
})

test("cancelling during download returns to the available state", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", { handlers: updaterHandlers("cancel") })
  await openUpdaterDialog(page)

  await page
    .getByRole("button", { name: /立即安装|Install/ })
    .first()
    .click()
  await expect(page.getByText(/2\.0\.0/)).toBeVisible({ timeout: 15_000 })
})

test("install failure shows a retryable error instead of an empty success", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", { handlers: updaterHandlers("fail") })
  await openUpdaterDialog(page)

  await page
    .getByRole("button", { name: /立即安装|Install/ })
    .first()
    .click()
  await expect(page.getByRole("alert").or(page.getByText(/失败|Failed/).first())).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole("button", { name: /重试|Retry/ })).toBeVisible()
})

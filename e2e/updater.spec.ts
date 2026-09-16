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

// 行为用可序列化标记描述（函数无法过 addInitScript 的序列化边界）。
function updaterHandlers(mode: "download" | "cancel" | "fail") {
  return {
    get_current_app_version: "1.28.0",
    check_for_app_update: UPDATE_AVAILABLE,
    download_and_install_app_update:
      mode === "fail"
        ? // 先进 downloading，随后安装失败（可重试错误路径）。
          {
            __mockReject: {
              code: "UPDATER_PERMISSION_DENIED",
              message: "permission denied",
              afterMs: 150,
            },
          }
        : mode === "cancel"
          ? // 下载 5s 后被取消（UPDATER_CANCELLED → 状态机回 available）。
            { __mockReject: { code: "UPDATER_CANCELLED", message: "cancelled", afterMs: 5000 } }
          : { __mockDelay: 300 },
    cancel_app_update_download: true,
    read_updater_policy: {
      autoCheckEnabled: true,
      lastSuccessfulCheckAt: 0,
      lastFailureAt: 0,
      failureCount: 0,
    },
  }
}

async function openUpdaterDialog(page: Page) {
  // 更新入口当前在「软件设置 → 关于」标签页（updater.checkNow 按钮触发
  // interactive check，UpdateDialog 随之打开）。
  await page.getByRole("button", { name: /软件设置|Settings/ }).click()
  const settings = page.getByRole("dialog")
  await expect(settings).toBeVisible({ timeout: 15_000 })
  // 设置页 tab 是普通 button（无 ARIA tab 角色），按文本定位。
  await settings.getByRole("button", { name: /关于|About/ }).click()
  await settings.getByRole("button", { name: /检查更新|Check for updates/ }).click()
  await expect(
    page.getByRole("dialog").filter({ hasText: /软件更新|Software update/ }),
  ).toBeVisible({
    timeout: 15_000,
  })
}

test("download progress reaches readyToRestart", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", { handlers: updaterHandlers("download") })
  await openUpdaterDialog(page)

  await page
    .getByRole("button", { name: /下载并安装|Install now/ })
    .first()
    .click()
  await expect(page.getByText(/更新已安装完成|Ready to restart/)).toBeVisible({ timeout: 15_000 })
})

test("cancelling during download returns to the available state", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", { handlers: updaterHandlers("cancel") })
  await openUpdaterDialog(page)

  await page
    .getByRole("button", { name: /下载并安装|Install now/ })
    .first()
    .click()
  // 进入下载中后点「取消下载」，状态机回 available：CTA 恢复、版本信息可见。
  const cancelButton = page.getByRole("button", { name: /取消下载|Cancel download/ })
  await expect(cancelButton).toBeVisible({ timeout: 15_000 })
  await cancelButton.click()
  await expect(page.getByText(/最新版本 2\.0\.0/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("button", { name: /下载并安装|Install now/ })).toBeVisible()
})

test("install failure shows a retryable error instead of an empty success", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", { handlers: updaterHandlers("fail") })
  await openUpdaterDialog(page)

  await page
    .getByRole("button", { name: /下载并安装|Install now/ })
    .first()
    .click()
  await expect(page.getByRole("alert").or(page.getByText(/失败|Failed/).first())).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole("button", { name: /重试|Retry/ })).toBeVisible()
})

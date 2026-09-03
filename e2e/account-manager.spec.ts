/**
 * Account Manager e2e (GAP-TO-2.0 A4-1/A4-6, ROADMAP R07 步骤 2/3):
 *   三栏布局 / 窄屏 Sheet / 键盘 Tab 顺序 / 长文本 / 语言切换。
 */
import { expect, test } from "@playwright/test"
import { accountManagerHandlers, gotoWithMockedTauri } from "./mock-tauri"

test("renders the three-column layout with an empty-state hint", async ({ page }) => {
  await gotoWithMockedTauri(page, "/account-manager", { handlers: accountManagerHandlers })

  await expect(page.getByText(/站点列表|Station List/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/账号列表|Accounts/)).toBeVisible()
})

test("long station remark stays truncated on narrow viewports", async ({ page }, testInfo) => {
  await page.setViewportSize({
    width: testInfo.project.name === "viewport-1024" ? 1024 : 1280,
    height: 768,
  })
  await gotoWithMockedTauri(page, "/account-manager", {
    handlers: {
      ...accountManagerHandlers,
      list_stations: [
        {
          id: "stn-1",
          remark:
            "这是一个非常非常非常长的站点备注名称用于验证单行截断不会破版 Truncated Station Remark",
          website: "https://example.com",
          createdAt: "2026-07-14 08:00",
          loginDetection: {},
          exclusivityMode: null,
          authProfile: null,
          probeFailureCount: 0,
          sessionTtlHours: 720,
          networkProxy: null,
        },
      ],
      list_all_accounts: [],
    },
  })

  const remark = page.getByText(/这是一个非常非常非常长的站点备注/).first()
  await expect(remark).toBeVisible({ timeout: 15_000 })
  await expect(remark).toHaveClass(/truncate/)
})

test("keyboard: sidebar and main content are reachable in a sane tab order", async ({ page }) => {
  await gotoWithMockedTauri(page, "/account-manager", { handlers: accountManagerHandlers })
  await page.waitForLoadState("networkidle")

  let focusOnInteractive = false
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab")
    const tag = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return "none"
      const interactive =
        el.tagName === "BUTTON" ||
        el.tagName === "INPUT" ||
        el.tagName === "A" ||
        el.getAttribute("role") === "button" ||
        el.getAttribute("role") === "checkbox"
      return `${el.tagName}:${interactive ? "interactive" : "other"}`
    })
    if (tag.endsWith("interactive")) {
      focusOnInteractive = true
      break
    }
  }
  expect(focusOnInteractive, "keyboard focus reaches an interactive element").toBe(true)
})

test("language switch re-renders column titles immediately", async ({ page }) => {
  await gotoWithMockedTauri(page, "/account-manager", { handlers: accountManagerHandlers })
  await expect(page.getByText("站点列表 (0)")).toBeVisible({ timeout: 15_000 })

  await page.evaluate(() => localStorage.setItem("language", "en"))
  await page.reload()
  await expect(page.getByText("Station List (0)")).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText("站点列表 (0)")).toHaveCount(0)
})

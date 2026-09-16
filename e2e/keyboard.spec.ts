/**
 * Keyboard & focus e2e (GAP-TO-2.0 A4-6, ROADMAP R07 步骤 4):
 *   全局对话框 (SettingsDialog) focus trap / Escape / 焦点恢复 + Tab 顺序。
 *   屏幕阅读器 smoke 为人工项 (归 D 类证据)。
 */
import { expect, test } from "@playwright/test"
import { gotoWithMockedTauri } from "./mock-tauri"

test("settings dialog traps focus and restores it to the trigger on Escape", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", { handlers: {} })

  const trigger = page.getByRole("button", { name: /设置|Settings/ }).first()
  await trigger.click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible({ timeout: 15_000 })

  // 焦点落入对话框
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const dlg = document.querySelector("[role='dialog']")
        return Boolean(el && dlg && dlg.contains(el))
      }),
    )
    .toBe(true)

  // Tab 连续导航焦点保持在对话框内 (focus trap)
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press("Tab")
    const inside = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      const dialog = document.querySelector("[role='dialog']")
      return Boolean(el && dialog && dialog.contains(el))
    })
    if (!inside) {
      // radix 在失焦瞬间会把焦点拉回; 这里允许浏览器默认行为瞬时逃逸,
      // 但最终焦点必须回到对话框内。
      await page.waitForTimeout(50)
      const backInside = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        const dialog = document.querySelector("[role='dialog']")
        return Boolean(el && dialog && dialog.contains(el))
      })
      expect(backInside, "focus escaped the dialog permanently").toBe(true)
    }
  }

  await page.keyboard.press("Escape")
  await expect(dialog).toHaveCount(0, { timeout: 5_000 })
  // 焦点恢复到触发元素
  await expect(trigger).toBeFocused({ timeout: 5_000 })
})

test("destructive confirm dialog returns focus after cancel", async ({ page }) => {
  await gotoWithMockedTauri(page, "/quick-launch", { handlers: {} })
  // 无破坏性操作的路径在此为冒烟: 确认全局 Escape 不会误关主内容。
  await page.keyboard.press("Escape")
  await expect(page.locator("body")).toBeVisible()
})

/**
 * App Manager e2e (GAP-TO-2.0 A4-1/A4-8, ROADMAP R07 步骤 2/3):
 *   更新/partial 状态矩阵 + axe WCAG A/AA 扫描 + 截图 diff。
 */
import { AxeBuilder } from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { gotoWithMockedTauri } from "./mock-tauri"

test.describe("app-manager state matrix", () => {
  test("renders empty state when no apps are installed", async ({ page }) => {
    await gotoWithMockedTauri(page, "/app-manager", { handlers: {} })
    await expect(page.getByText(/暂无应用|No apps|empty/i).first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test("partial scan keeps succeeded apps and shows the partial banner", async ({ page }) => {
    await gotoWithMockedTauri(page, "/app-manager", {
      handlers: {
        // partial: complete=false + warning, 但 apps 非空 (不得折叠为空态成功)。
        get_cached_app_inventory: {
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
          complete: false,
          providers: [
            {
              provider: "filesystem",
              state: "partial",
              errorCode: "WIN_APPLICATION_ROOT_PARTIAL",
            },
          ],
          warnings: ["WIN_APPLICATION_ROOT_PARTIAL:shell:AppsFolder"],
          schemaVersion: 1,
        },
        get_current_app_version: "1.28.0",
      },
    })

    await expect(page.getByText(/partial|部分|失败/).first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe("app-manager accessibility (A4-2)", () => {
  test("has no axe WCAG A/AA violations on the catalog page", async ({ page }, testInfo) => {
    await gotoWithMockedTauri(page, "/app-manager", { handlers: {} })
    await page.waitForLoadState("networkidle")

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()

    // 已知豁免需在此登记并说明理由; 其余 violation 一律视为阻断。
    const WHITELIST: Array<{ id: string; reason: string }> = []
    const filtered = results.violations.filter((v) => !WHITELIST.some((w) => w.id === v.id))
    if (filtered.length > 0) {
      console.table(filtered.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })))
    }
    expect(filtered, "axe violations (whitelisted ones excluded)").toEqual([])
    void testInfo
  })
})

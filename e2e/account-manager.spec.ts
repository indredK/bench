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

/**
 * 浏览器互通弹窗的宽度回归（互通面板文案密度高：站点/目标选择 + 实例状态 +
 * 注入回执 + 存储恢复终态 + 长路径 / UA / cookie 名列表）。
 *
 * 钉两件事：
 * 1. 弹窗实际渲染宽度达到 `sm:max-w-lg`（历史上为修 D3「被内容撑宽」压到 460px，
 *    结果反过来变成「内容挤不进去」；D3 的正解是 break-all + min-w-0，不是窄）；
 * 2. 内容不横向溢出弹窗（DialogContent 是 overflow-x-hidden，溢出=被裁掉，
 *    用户看到的就是半截文字，且不会有任何滚动条提示）。
 */
test("browser interop dialog keeps its width and does not clip content", async ({ page }) => {
  await gotoWithMockedTauri(page, "/account-manager", {
    handlers: {
      ...accountManagerHandlers,
      list_stations: [
        {
          id: "stn-1",
          remark: "Trae CN",
          website: "https://www.trae.cn",
          createdAt: "2026-09-10 10:00",
          loginDetection: {},
          exclusivityMode: null,
          authProfile: null,
          probeFailureCount: 0,
          sessionTtlHours: 720,
          networkProxy: null,
        },
      ],
      list_all_accounts: [
        {
          id: "acct-1",
          stationId: "stn-1",
          username: "alice",
          notes: "",
          phone: null,
          tgAccount: null,
          linkedAccount: null,
          inviteLink: null,
          loginMethods: [],
          status: "ready",
          lastLoginAt: null,
          lastRefreshedAt: null,
          createdAt: "2026-09-10 10:00",
          hasPassword: false,
        },
      ],
      list_account_logs: { entries: [], schedule: null, nextRefreshAtTs: null },
      browser_session_browsers: [{ id: "chrome", name: "Google Chrome" }],
      browser_session_status: { running: true, browserId: "chrome", port: 9333 },
      get_browser_extension_status: {
        exported: true,
        extensionDir: "/Users/dev/浏览器扩展/bench-companion",
        extensionId: "dmcfgfpfilhgcoddmciglpjdggkpinje",
        extensionVersion: "0.10.0",
        hostBinFound: true,
        hostBinPath: "/Applications/Bench.app/Contents/MacOS/bench-host",
        nmRegistrations: [],
        browsers: [],
        bridgeReady: true,
        bridgePort: 51234,
      },
    },
  })

  await page
    .getByText(/Trae CN/)
    .first()
    .click()
  await page.getByText("alice").first().click()
  // 宽视口下账号行与详情栏各有一个「浏览器互通」入口（同一个弹窗），取第一个。
  await page.getByRole("button", { name: "浏览器互通" }).first().click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible({ timeout: 15_000 })

  const geometry = await dialog.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    overflowX: Math.round(el.scrollWidth - el.clientWidth),
  }))
  expect(geometry.width, "弹窗应保持 sm:max-w-lg（512px）").toBeGreaterThanOrEqual(500)
  expect(geometry.overflowX, "内容不得横向溢出弹窗").toBeLessThanOrEqual(1)
})

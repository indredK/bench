import { defineConfig, devices } from "@playwright/test"

/**
 * Playwright e2e / 视觉回归配置 (GAP-TO-2.0 A4-1/A4-2, ROADMAP R07)。
 *
 * - 用 mock 的 Tauri IPC 渲染纯前端状态, 不依赖桌面后端 (e2e/mock-tauri.ts)。
 * - viewport 矩阵: 1024x768 / 1280x800 / 1440x900, 以及 Windows 125%/150% 缩放
 *   等效 (deviceScaleFactor 1.25 / 1.5)。
 * - 截图 baseline 首次生成后必须人工审查; 禁止无条件更新
 *   (`pnpm run test:e2e -- --update-snapshots` 需人工确认 diff 后才允许提交)。
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:1420",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 0,
      animations: "disabled",
      caret: "hide",
    },
  },
  projects: [
    {
      name: "viewport-1024",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
    {
      name: "viewport-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "viewport-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "windows-scaling-125",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: 1.25,
      },
    },
    {
      name: "windows-scaling-150",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1.5,
      },
    },
  ],
  webServer: {
    command: "pnpm run dev:fe",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

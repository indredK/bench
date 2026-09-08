/**
 * 页面冒烟测试：jsdom 渲染插件根组件，捕获"打开即白屏"类回归。
 * 白屏 = 渲染期未捕获异常；本测试让异常直接浮出到 vitest 报告。
 * 注意：Tauri IPC 在 jsdom 中不可用，controller 的 invoke 会失败——
 * 组件应展示错误态而非抛出未捕获异常（宿主行为契约）。
 */
import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import "@extension/i18n"
import Page from "@extension/page"

// jsdom 环境无 Tauri IPC：提供最小 invoke 桩，避免未处理 rejection 掩盖渲染问题
;(globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: () => Promise.reject(new Error("tauri unavailable in test")),
  transformCallback: () => 0,
}

describe("clean-space page smoke", () => {
  it("renders without crashing (no white screen)", async () => {
    render(<Page />)
    // 顶部标签栏是首屏必然渲染的内容
    await waitFor(
      () => {
        expect(screen.getAllByRole("button").length).toBeGreaterThan(0)
      },
      { timeout: 3000 },
    )
  })
})

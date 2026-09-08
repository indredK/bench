/**
 * 页面冒烟测试：jsdom 渲染插件根组件，捕获"打开即白屏"类回归。
 * Tauri IPC 在 jsdom 中不可用——组件应展示错误/空态而非抛未捕获异常。
 */
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import "@extension/i18n"
import PhotoTriagePage from "@extension/page"

;(globalThis as Record<string, unknown>).__TAURI_INTERNALS__ = {
  invoke: () => Promise.reject(new Error("tauri unavailable in test")),
  transformCallback: () => 0,
}

describe("photo-triage page smoke", () => {
  it("renders without crashing (no white screen)", () => {
    render(<PhotoTriagePage />)
    // 渲染不抛异常即通过（首屏内容可能处于加载/错误态）
    expect(document.body).toBeInTheDocument()
  })
})

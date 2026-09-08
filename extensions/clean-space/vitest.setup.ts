/**
 * 测试环境：与宿主 src/test-setup.ts 同构（jsdom 缺失 API polyfill）。
 * 插件窗口内无 Tauri 后端 mock 需求由各测试自行注入。
 */
import "@testing-library/jest-dom/vitest"

if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

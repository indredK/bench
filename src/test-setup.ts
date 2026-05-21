/**
 * Test Runtime / 测试环境: configure tests only; 只配置测试环境.
 */
import "@testing-library/jest-dom/vitest";

if (typeof ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
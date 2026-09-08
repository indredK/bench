import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

/**
 * clean-space 插件测试配置（P4.5 插件测试 runner 雏形）。
 *
 * 与宿主 vite.config.ts 的 test 段同构（jsdom + globals + ResizeObserver
 * polyfill），alias 与插件构建配置完全一致（含 "@/i18n/config" 重绑定）。
 * 宿主 vitest 显式 exclude extensions/**，插件测试用
 * `pnpm run test:extensions` 单独执行。
 */
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  resolve: {
    alias: {
      "@/i18n/config": path.resolve(import.meta.dirname, "./src/i18n.ts"),
      "@": path.resolve(import.meta.dirname, "../../src"),
      "@extension": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [path.resolve(import.meta.dirname, "vitest.setup.ts")],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
  },
})

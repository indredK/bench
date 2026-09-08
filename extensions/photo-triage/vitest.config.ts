import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

/**
 * photo-triage 插件测试配置（P4.5 插件测试 runner；宿主 vitest exclude extensions/**）。
 * alias 与插件构建配置一致（含 "@/i18n/config" 重绑定）。
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

import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

/**
 * photo-triage 插件独立构建（D-024 / P2b）。
 *
 * - `@`     → 宿主主包 src（复用 components/ui、lib/tauri、styles，随 bundle 打包）；
 * - `@extension` → 插件自身源码（extensions/photo-triage/src）；
 * - 产物 outDir = `assets/`（经 scripts/plugins/sync-extensions.mjs 同步到运行时目录）；
 * - Tailwind 4 走宿主根 postcss 配置（vite 自 root 向上查找），class 从本插件模块图扫描。
 */
export default defineConfig({
  root: import.meta.dirname,
  // 相对 base：插件页部署在 tauri://localhost/ext/<id>/ 子路径下，
  // 绝对路径 /bundle/... 会丢前缀 404（P2b 实测坑）。
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../src"),
      "@extension": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "assets",
    assetsDir: "bundle",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
})

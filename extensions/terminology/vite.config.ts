import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

/**
 * terminology 插件独立构建（D-024 / P5）。
 *
 * - `@`          → 宿主主包 src（复用 components/ui、lib/tauri、styles，随 bundle 打包）；
 * - `@extension` → 插件自身源码（extensions/terminology/src）；
 * - 产物 outDir = `assets/`（经 extensions:stage 打进 resources，或 extensions:sync 同步运行时）；
 * - `base: "./"` 是硬性要求（子路径部署 404 铁律）。
 */
export default defineConfig({
  root: import.meta.dirname,
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

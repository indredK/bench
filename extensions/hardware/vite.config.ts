import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

/**
 * hardware 插件独立构建（D-024 / P5）。
 *
 * - `@`          → 宿主主包 src（复用 components/ui、lib/tauri、styles，随 bundle 打包）；
 * - `@extension` → 插件自身源码（extensions/hardware/src）；
 * - 产物 outDir = `assets/`（经 extensions:stage 打进 resources，或 extensions:sync 同步运行时）；
 * - `base: "./"` 是硬性要求（子路径部署 404 铁律）。
 */
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      // ⚠️ 顺序铁律：vite alias 按声明顺序匹配，"@" 是前缀规则（"@" + "/"），
      // 必须把更具体的 "@/i18n/config" 放在 "@" **之前**，否则会被 "@" 截胡
      // （P5 教训：别名放在 "@" 之后 = 完全不生效，宿主 config 混入插件
      // bundle 并覆盖插件 i18n 实例，t() 全部返回 key 原文）。
      "@/i18n/config": path.resolve(import.meta.dirname, "./src/i18n.ts"),
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

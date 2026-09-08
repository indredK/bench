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

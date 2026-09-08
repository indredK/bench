/**
 * hardware 插件入口（P5 迁移）。
 *
 * 独立于宿主前端的 React 应用：自带 i18n 资源，
 * 复用宿主的 UI 组件库 / Tauri 能力面 wrapper（随 bundle 打包）。
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"

import "@/styles/index.css"
import "@extension/i18n"
import Page from "@extension/page"

const container = document.getElementById("root")
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <Page />
      <Toaster position="top-center" />
    </React.StrictMode>,
  )
}

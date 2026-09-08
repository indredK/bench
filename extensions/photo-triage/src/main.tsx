/**
 * photo-triage 插件入口（P2b）。
 *
 * 独立于宿主前端的 React 应用：自带 i18n 资源（photoTriage + common），
 * 复用宿主的 UI 组件库 / Tauri 能力面 wrapper（随 bundle 打包）。
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"

import "@/styles/index.css"
import "@extension/i18n"
import PhotoTriagePage from "@extension/page"

const container = document.getElementById("root")
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <PhotoTriagePage />
      <Toaster position="top-center" />
    </React.StrictMode>,
  )
}

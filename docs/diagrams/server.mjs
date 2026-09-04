#!/usr/bin/env node
/**
 * Bench 架构图集 — 本地文档服务（无任何第三方依赖，Node ≥ 18）。
 *
 * 启动：
 *   node docs/diagrams/server.mjs            # 默认端口 3200
 *   DOCS_PORT=3300 node docs/diagrams/server.mjs
 *
 * 访问：http://localhost:3200
 *
 * 目录约定：
 *   index.html      图集门户（侧栏切换 5 种图，iframe 承载）
 *   *.html          archify 交付的交互式 SVG 单文件图
 *   specs/*.json    图的源规格（archify 校验/再生成用）
 */
import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.DOCS_PORT || 3200)
const HOST = process.env.DOCS_HOST || "127.0.0.1"
const INDEX = path.join(__dirname, "index.html")

const server = http.createServer((req, res) => {
  let pathname = "/"
  try {
    pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname
  } catch {
    pathname = "/"
  }

  // 根路径 → 图集门户
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
    res.end(fs.readFileSync(INDEX))
    return
  }

  // 仅放行 diagrams/ 下的静态文件（防目录穿越）
  const rel = pathname.replace(/^\//, "")
  if (rel && !rel.includes("..") && path.extname(rel)) {
    const file = path.join(__dirname, rel)
    if (path.resolve(file).startsWith(path.resolve(__dirname)) && fs.existsSync(file)) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(fs.readFileSync(file))
      return
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
  res.end("404 Not Found")
})

server.on("error", (e) => {
  console.error(`[bench-diagrams] 服务启动失败: ${e.message}`)
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  console.log(`\n[bench-diagrams] 架构图集已启动: http://localhost:${PORT}  (Ctrl+C 退出)\n`)
  console.log("图集目录: docs/diagrams/  ·  规格: specs/*.json")
})

const shutdown = () => server.close(() => process.exit(0))
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

#!/usr/bin/env node
/**
 * Bench 架构图 — 交互式文档预览启动器（零外部依赖，Node ≥ 18）。
 *
 * 用法：
 *   node docs/diagrams/launch.mjs            # 默认端口 3200
 *   DOCS_PORT=3300 node docs/diagrams/launch.mjs
 *
 * 行为：
 *   1. 扫描同目录下所有 *.html（排除 index.html 与自身）
 *   2. 让你选择一张图，或选「图集门户」一次看全部
 *   3. 后台启动 server.mjs 提供静态服务
 *   4. 自动打开浏览器到对应地址（无法打开时打印 URL）
 *   Ctrl+C 退出并关闭后台服务。
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import readline from "node:readline"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.DOCS_PORT || 3200)
const HOST = process.env.DOCS_HOST || "127.0.0.1"

const files = fs
  .readdirSync(__dirname)
  .filter(
    (f) =>
      f.endsWith(".html") &&
      f !== "index.html" &&
      f !== "launch.mjs" &&
      f !== path.basename(fileURLToPath(import.meta.url)),
  )
  .sort()

const options = [
  ...files.map((f, i) => ({ value: f, label: f.replace(/\.html$/, "") })),
  { value: "__portal", label: "图集门户（一次看全部）" },
]

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function ask(q) {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())))
}

function openBrowser(url) {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd /c start"
        : "xdg-open"
  try {
    spawn(cmd, [url], {
      stdio: "ignore",
      detached: process.platform !== "win32",
      shell: process.platform === "win32",
    }).unref?.()
  } catch {
    /* ignore */
  }
}

async function main() {
  console.log("\n  可用架构图：")
  options.forEach((o, i) => console.log(`   ${String(i + 1).padStart(2)}. ${o.label}`))
  const ans = await ask(`\n  选择要预览的编号 [1-${options.length}]（回车=图集门户）: `)
  let choice = options[options.length - 1]
  if (ans !== "") {
    const n = Number(ans)
    if (!Number.isInteger(n) || n < 1 || n > options.length) {
      console.log("  无效输入，改用图集门户。")
    } else {
      choice = options[n - 1]
    }
  }
  rl.close()

  const target = choice.value === "__portal" ? "/" : "/" + choice.value
  const child = spawn("node", ["server.mjs"], {
    cwd: __dirname,
    env: { ...process.env, DOCS_PORT: String(PORT), DOCS_HOST: HOST },
    stdio: "inherit",
  })

  const url = `http://${HOST}:${PORT}${target}`
  // 等待服务端口就绪再打开浏览器
  const tryOpen = (tries = 20) => {
    if (tries <= 0) {
      console.log(`\n  请在浏览器打开: ${url}\n`)
      return
    }
    const s = spawn(
      "node",
      [
        "-e",
        `require('http').get('http://${HOST}:${PORT}/',r=>process.exit(0)).on('error',()=>process.exit(1))`,
      ],
      { stdio: "ignore" },
    )
    s.on("close", (code) => {
      if (code === 0) {
        console.log(`\n  已打开预览: ${url}\n  （Ctrl+C 停止服务）\n`)
        openBrowser(url)
      } else setTimeout(() => tryOpen(tries - 1), 150)
    })
  }
  setTimeout(() => tryOpen(), 400)

  const shutdown = () => {
    try {
      child.kill("SIGTERM")
    } catch {}
    process.exit(0)
  }
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}

main()

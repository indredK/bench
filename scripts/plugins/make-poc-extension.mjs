#!/usr/bin/env node
/**
 * P1 概念验证：生成 POC 插件前端产物到应用数据目录。
 *
 * 目的（见 docs/modules/extension-center/roadmap.md 的 P1 概念验证）：
 * 验证 Tauri v2 能否在运行时把 `$APPDATA/extensions/<id>/` 下的前端 bundle
 * 当作**同源本地页面**渲染，并保持 IPC 可用。
 *
 * 产物结构（模拟一个真实插件 zip 解压后的样子）：
 *   $APPDATA/extensions/bench-poc/
 *     manifest.json
 *     index.html
 *     assets/style.css
 *     assets/main.js     <- ESM 入口，执行自检
 *     assets/chunk.js    <- 被 main.js 相对导入，验证多文件 chunk
 *
 * 用法：
 *   node scripts/plugins/make-poc-extension.mjs            # 生成产物
 *   node scripts/plugins/make-poc-extension.mjs --print-dir # 只打印目标目录
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { homedir, platform } from "node:os"
import { join } from "node:path"

/** 与 src-tauri/tauri.conf.json 的 identifier 保持一致。 */
const IDENTIFIER = "com.bench.app"

const EXTENSION_ID = "bench-poc"
const EXTENSION_VERSION = "1.0.0"

/** 与 src-tauri/src/extension_host/assets.rs::EXT_DIR_NAME 一致。 */
const EXT_DIR_NAME = "extensions"

/**
 * 解析 Tauri v2 的 appDataDir。
 * - macOS/Linux: $HOME/Library/Application Support/<identifier>
 * - Windows:     %APPDATA%/<identifier>
 */
function appDataDir() {
  const home = homedir()
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", IDENTIFIER)
    case "win32":
      return join(process.env.APPDATA || join(home, "AppData", "Roaming"), IDENTIFIER)
    default:
      return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), IDENTIFIER)
  }
}

/**
 * manifest schema v2（P3.1）。`files` 逐文件清单在写入产物后生成：
 * `manifest.json` 自身不入清单（文件哈希无法自嵌套，完整性由宿主对
 * canonical 文本的验签覆盖，spec §3.3）。
 */
const MANIFEST = {
  schemaVersion: 2,
  id: EXTENSION_ID,
  version: EXTENSION_VERSION,
  display: { zh: "插件机制验证包", en: "Extension POC" },
  distribution: "bundled",
  entry: { index: "index.html" },
  acl: { commands: ["ext_poc_report"] },
  engines: { bench: ">=2.0.0" },
}

/** 产物文件（相对插件根）→ 生成 `files` 清单的固定顺序。 */
const BUNDLE_FILES = ["index.html", "assets/style.css", "assets/main.js", "assets/chunk.js"]

const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Bench Extension POC</title>
    <link rel="stylesheet" href="./assets/style.css" />
  </head>
  <body>
    <div id="root">
      <h1>Extension POC</h1>
      <p class="hint">自检运行中…</p>
    </div>
    <script type="module" src="./assets/main.js"></script>
  </body>
</html>
`

const STYLE_CSS = `:root {
  color-scheme: light;
  --bg: #ffffff;
  --fg: #1a1d21;
  --muted: #78828c;
  --ok: #1f7a4d;
  --bad: #c8342b;
  --border: #e3e6ea;
}

body {
  margin: 0;
  padding: 28px 32px;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro SC", "PingFang SC", system-ui, sans-serif;
  line-height: 1.6;
}

h1 { font-size: 20px; margin: 0 0 4px; }
.hint { color: var(--muted); font-size: 13px; margin: 0 0 20px; }
.url { color: var(--muted); font-size: 12px; word-break: break-all; margin: 0 0 20px; }

table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { color: var(--muted); font-weight: 600; background: #f7f8fa; }
td.status { font-weight: 700; white-space: nowrap; }
.pass { color: var(--ok); }
.fail { color: var(--bad); }
code { background: #f0f2f5; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
`

const MAIN_JS = `// POC 插件入口（ESM）。执行自检并把结果回报宿主。
import { SELF_TEST_VERSION, renderReport } from "./chunk.js"

/**
 * 自检项。每一项都对应 B' 方案的一个关键假设：
 * - assetKey:      插件页是否真的从 tauri://localhost/ext/... 加载（同源）
 * - tauriInternals: 是否获得 IPC 注入（决定插件能否调用宿主能力）
 * - esmRelativeImport: 相对 ESM 导入是否可用（决定 React bundle 的 chunk 能否加载）
 * - invokeCommand:  invoke 自定命令是否成功（决定插件↔宿主通信是否打通）
 * - domRender:      DOM 渲染是否成功（决定插件能否提供完整 UI）
 */
async function runSelfTest() {
  const checks = []
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: String(detail) })

  // 1. 页面来源
  add("assetKey.origin", location.origin.startsWith("tauri://") || location.origin.startsWith("http://ipc") || location.origin.includes("localhost"), location.href)

  // 2. IPC 注入
  const internals = window.__TAURI_INTERNALS__
  add("tauriInternals.injected", Boolean(internals), internals ? typeof internals.invoke : "missing")

  // 3. 相对 ESM 导入（由本文件的 import 成功与否间接证明）
  add("esmRelativeImport", SELF_TEST_VERSION === "1.0.0", "imported ./chunk.js -> " + SELF_TEST_VERSION)

  // 4. DOM 渲染
  let domOk = false
  try {
    const root = document.getElementById("root")
    root.innerHTML = ""
    const title = document.createElement("h1")
    title.textContent = "Extension POC 自检报告"
    const url = document.createElement("p")
    url.className = "url"
    url.textContent = location.href
    root.append(title, url)
    domOk = root.querySelectorAll("h1").length === 1
  } catch (error) {
    add("domRender", false, error && error.message)
  }
  if (domOk) add("domRender", true, "mounted into #root")

  // 5. invoke 自定命令
  let invokeOk = false
  try {
    if (internals && typeof internals.invoke === "function") {
      await internals.invoke("ext_poc_report", {
        payload: { extensionId: "bench-poc", version: SELF_TEST_VERSION, checks },
      })
      invokeOk = true
      add("invokeCommand", true, "ext_poc_report accepted")
    } else {
      add("invokeCommand", false, "__TAURI_INTERNALS__.invoke unavailable")
    }
  } catch (error) {
    add("invokeCommand", false, (error && (error.message || error)) || "unknown error")
  }

  const passed = checks.filter((c) => c.ok).length
  renderReport(checks)
  return { extensionId: "bench-poc", version: SELF_TEST_VERSION, passed, total: checks.length, checks, invokeReported: invokeOk }
}

runSelfTest()
  .then((result) => {
    if (!result.invokeReported) {
      // invoke 不可用时，至少把结论留在页面上供人工读取。
      console.warn("[poc] invoke unavailable, result only rendered:", result)
    }
  })
  .catch((error) => {
    console.error("[poc] self test crashed:", error)
  })
`

const CHUNK_JS = `// 被 main.js 相对导入的第二个模块：验证多文件 chunk 能被正常加载。
export const SELF_TEST_VERSION = "1.0.0"

export function renderReport(checks) {
  const table = document.createElement("table")
  const head = document.createElement("tr")
  for (const label of ["检查项", "结果", "详情"]) {
    const th = document.createElement("th")
    th.textContent = label
    head.append(th)
  }
  const thead = document.createElement("thead")
  thead.append(head)

  const tbody = document.createElement("tbody")
  for (const check of checks) {
    const tr = document.createElement("tr")

    const name = document.createElement("td")
    name.textContent = check.name

    const status = document.createElement("td")
    status.className = "status " + (check.ok ? "pass" : "fail")
    status.textContent = check.ok ? "PASS" : "FAIL"

    const detail = document.createElement("td")
    detail.innerHTML = ""
    detail.textContent = check.detail

    tr.append(name, status, detail)
    tbody.append(tr)
  }

  table.append(thead, tbody)
  document.getElementById("root").append(table)
}
`

function main() {
  const dataDir = appDataDir()
  const target = join(dataDir, EXT_DIR_NAME, EXTENSION_ID)

  if (process.argv.includes("--print-dir")) {
    console.log(target)
    return
  }

  // 全量重建：先清空目标目录，避免历史残留文件触发宿主「清单外文件」拒绝。
  rmSync(target, { recursive: true, force: true })
  mkdirSync(join(target, "assets"), { recursive: true })
  writeFileSync(join(target, "index.html"), INDEX_HTML)
  writeFileSync(join(target, "assets", "style.css"), STYLE_CSS)
  writeFileSync(join(target, "assets", "main.js"), MAIN_JS)
  writeFileSync(join(target, "assets", "chunk.js"), CHUNK_JS)

  // P3.1：先写产物，再生成逐文件 hash 清单，最后写 manifest。
  const files = BUNDLE_FILES.map((rel) => {
    const bytes = readFileSync(join(target, rel))
    return {
      path: rel,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      size: bytes.length,
    }
  })
  writeFileSync(
    join(target, "manifest.json"),
    JSON.stringify({ ...MANIFEST, files }, null, 2) + "\n",
  )

  console.log("[poc] extension bundle written to:")
  console.log("  " + target)
  console.log("")
  console.log("下一步（P1 验证）:")
  console.log("  BENCH_POC_EXT=1 pnpm run dev")
  console.log("  窗口打开后，结果写入 " + join(dataDir, "poc-verify-result.json"))
}

main()

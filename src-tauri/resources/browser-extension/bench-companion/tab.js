/**
 * Bench Companion — 完整面板（options page）。
 * 存储扫描 / 相册摘要 / MCP 配置指引。
 */

const $status = document.getElementById("status")

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve))
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
}

function fmtBytes(n) {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + " GB"
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + " MB"
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB"
  return n + " B"
}

// —— 存储扫描 ——
const $scanBtn = document.getElementById("scan-btn")
$scanBtn.addEventListener("click", async () => {
  const path = document.getElementById("scan-path").value.trim()
  const days = Number(document.getElementById("scan-days").value) || 0
  const subs = document.getElementById("scan-sub").checked
  const out = document.getElementById("scan-out")
  if (!path) return
  $scanBtn.disabled = true
  out.innerHTML = '<div class="empty">扫描中…</div>'
  const res = await send({
    type: "bench:invoke",
    cmd: "clean_space_scan_custom_folder",
    params: { path, mtimeDays: days, includeSubfolders: subs },
    timeoutMs: 120000,
  })
  $scanBtn.disabled = false
  if (!res.ok) {
    out.innerHTML = '<div class="error">' + escapeHtml(res.error) + "</div>"
    return
  }
  const d = res.data
  const rows = (d.items || [])
    .slice(0, 30)
    .map(
      (it) =>
        "<tr><td>" +
        escapeHtml(it.name) +
        '</td><td class="num">' +
        fmtBytes(it.size_bytes) +
        "</td><td>" +
        escapeHtml(it.reason) +
        "</td></tr>",
    )
    .join("")
  out.innerHTML =
    '<div class="stat">' +
    '<div class="cell"><div class="num">' +
    fmtBytes(d.freed_bytes) +
    '</div><div class="lbl">估算可释放</div></div>' +
    '<div class="cell"><div class="num">' +
    d.item_count +
    '</div><div class="lbl">命中条目</div></div>' +
    "</div>" +
    (rows
      ? '<table><thead><tr><th>文件</th><th class="num">大小</th><th>原因</th></tr></thead><tbody>' +
        rows +
        "</tbody></table>"
      : '<div class="empty">无早于 ' + days + " 天的文件</div>")
})

// —— 相册摘要 ——
const $albumBtn = document.getElementById("album-btn")
$albumBtn.addEventListener("click", async () => {
  const buildDir = document.getElementById("album-build").value.trim()
  const out = document.getElementById("album-out")
  if (!buildDir) return
  $albumBtn.disabled = true
  out.innerHTML = '<div class="empty">读取中…</div>'
  const res = await send({
    type: "bench:invoke",
    cmd: "photo_triage_album_summary",
    params: { buildDir },
  })
  $albumBtn.disabled = false
  if (!res.ok) {
    out.innerHTML = '<div class="error">' + escapeHtml(res.error) + "</div>"
    return
  }
  const d = res.data
  const rows = (d.top_folders || [])
    .map(
      (f) => "<tr><td>" + escapeHtml(f.folder) + '</td><td class="num">' + f.count + "</td></tr>",
    )
    .join("")
  out.innerHTML =
    '<div class="stat">' +
    '<div class="cell"><div class="num">' +
    d.count +
    '</div><div class="lbl">条目总数</div></div>' +
    '<div class="cell"><div class="num">' +
    d.photos +
    '</div><div class="lbl">照片</div></div>' +
    '<div class="cell"><div class="num">' +
    d.videos +
    '</div><div class="lbl">视频</div></div>' +
    '<div class="cell"><div class="num">' +
    d.lives +
    '</div><div class="lbl">Live</div></div>' +
    '<div class="cell"><div class="num">' +
    d.deleted +
    '</div><div class="lbl">已删除</div></div>' +
    '<div class="cell"><div class="num">' +
    fmtBytes(d.total_bytes) +
    '</div><div class="lbl">总大小</div></div>' +
    "</div>" +
    (rows
      ? '<table><thead><tr><th>目录</th><th class="num">条目</th></tr></thead><tbody>' +
        rows +
        "</tbody></table>"
      : "")
})

// —— MCP 指引 ——
document.getElementById("mcp-snippet").textContent = JSON.stringify(
  {
    mcpServers: {
      bench: {
        command: "/Applications/Bench.app/Contents/MacOS/bench-host",
        args: ["mcp"],
      },
    },
  },
  null,
  2,
)

// —— 状态 ——
;(async () => {
  const s = await send({ type: "bench:status" })
  if (s.connected) {
    $status.textContent = "已连接 bench-host"
    $status.className = "badge on"
  } else {
    $status.textContent = "未连接 Bench"
    $status.className = "badge off"
  }
})()

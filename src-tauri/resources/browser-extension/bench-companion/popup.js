/**
 * Bench Companion — popup。
 * 术语库搜索（真实调用本机 bench-host）+ 连接状态。
 */

const $status = document.getElementById("status")
const $q = document.getElementById("q")
const $hits = document.getElementById("hits")

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve))
}

function renderStatus(s) {
  if (s.connected) {
    $status.textContent = "已连接"
    $status.className = "badge on"
  } else {
    $status.textContent = "未连接 Bench"
    $status.className = "badge off"
    $status.title = s.lastError || "请确认 Bench 已安装并导出过浏览器扩展"
    $hits.innerHTML =
      '<div class="error">' +
      escapeHtml(
        s.lastError ||
          "无法连接本机 bench-host。请在 Bench 中执行「导出浏览器扩展」，或点击右下角重连。",
      ) +
      "</div>"
  }
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
}

function renderHits(hits, query) {
  if (!hits.length) {
    $hits.innerHTML = '<div class="empty">无命中：' + escapeHtml(query) + "</div>"
    return
  }
  $hits.innerHTML = hits
    .map((h) => {
      const links = (h.websites || [])
        .slice(0, 2)
        .map(
          (u, i) =>
            '<a href="' +
            escapeHtml(u) +
            '" target="_blank">' +
            (i === 0 ? "参考" : "链接 " + (i + 1)) +
            "</a>",
        )
        .join("")
      return (
        '<div class="hit">' +
        '<div class="t">' +
        escapeHtml(h.title) +
        "</div>" +
        '<div class="p">' +
        escapeHtml(h.path) +
        "</div>" +
        '<div class="d">' +
        escapeHtml(h.description) +
        "</div>" +
        (links ? "<div>" + links + "</div>" : "") +
        "</div>"
      )
    })
    .join("")
}

async function search(query) {
  if (!query.trim()) {
    $hits.innerHTML = ""
    return
  }
  $hits.innerHTML = '<div class="empty">搜索中…</div>'
  const res = await send({
    type: "bench:invoke",
    cmd: "terminology_search",
    params: { query, limit: 12 },
  })
  if (!res.ok) {
    $hits.innerHTML = '<div class="error">' + escapeHtml(res.error) + "</div>"
    return
  }
  renderHits(res.data.hits || [], query)
}

let debounce = null
$q.addEventListener("input", () => {
  clearTimeout(debounce)
  debounce = setTimeout(() => search($q.value), 200)
})

document.getElementById("open-tab").addEventListener("click", (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})

document.getElementById("reconnect").addEventListener("click", async (e) => {
  e.preventDefault()
  const s = await send({ type: "bench:reconnect" })
  renderStatus({ connected: s.connected, lastError: s.lastError })
})

// 初始化
;(async () => {
  const s = await send({ type: "bench:status" })
  renderStatus(s)
  if (s.connected) {
    const stats = await send({ type: "bench:invoke", cmd: "terminology_stats", params: {} })
    if (stats.ok && !stats.data.isEmpty) {
      $status.textContent = "已连接 · " + stats.data.termCount + " 条术语"
    }
  }
  $q.focus()
})()

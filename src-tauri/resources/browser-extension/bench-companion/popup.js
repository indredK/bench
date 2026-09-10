/**
 * Bench Companion — popup。
 *
 * 两块内容：
 * 1. **站点登录态**（互通 I3 读 / I5 写）——把日常浏览器里已经登录好的站点会话交给
 *    Bench，或把 Bench 里某账号的会话注入日常浏览器（会先备份、可一键回滚）。
 * 2. 术语库搜索（经本机 bench-host）。
 */

const $status = document.getElementById("status")
const $site = document.getElementById("site")
const $msg = document.getElementById("session-msg")
const $save = document.getElementById("save")
const $targets = document.getElementById("targets")
const $inject = document.getElementById("inject")
const $injectList = document.getElementById("inject-list")
const $backups = document.getElementById("backups")
const $q = document.getElementById("q")
const $hits = document.getElementById("hits")

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve))
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  )
}

function setMessage(text, kind) {
  $msg.textContent = text || ""
  $msg.className = "smsg" + (kind ? " " + kind : "")
}

function renderStatus(s) {
  if (s.connected) {
    $status.textContent = "已连接"
    $status.className = "badge on"
  } else {
    $status.textContent = "未连接 Bench"
    $status.className = "badge off"
    $status.title = s.lastError || "请确认 Bench 已安装并导出过浏览器扩展"
  }
}

// ── 术语库搜索 ───────────────────────────────────────────────

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

// ── 站点登录态 ───────────────────────────────────────────────

/** 当前活动标签页（需要 activeTab，由点击扩展图标触发授权）。 */
async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0] || null
}

const state = { url: null, resolved: null, pendingAccountId: null }

function originOf(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return parsed.origin
  } catch (e) {
    return null
  }
}

function renderSession() {
  const resolved = state.resolved
  $save.disabled = true
  $inject.disabled = true
  $targets.classList.add("hidden")
  $targets.innerHTML = ""
  $injectList.classList.add("hidden")
  $injectList.innerHTML = ""

  if (!state.url) {
    $site.textContent = "—"
    setMessage("请在一个 http(s) 网页上打开本面板。", "warn")
    return
  }
  $site.textContent = originOf(state.url) || state.url
  $site.title = state.url

  if (!resolved || !resolved.matched) {
    setMessage("Bench 里没有与该网址匹配的站点。请先在 Bench 添加对应站点。", "warn")
    return
  }

  const station = resolved.station
  setMessage("匹配站点：" + station.remark + "（" + resolved.confidence + "）", "ok")
  $save.disabled = false

  const accounts = resolved.accounts || []
  if (!accounts.length) {
    $inject.disabled = true
    $injectList.classList.remove("hidden")
    $injectList.innerHTML =
      '<div class="target"><span class="meta">该站点在 Bench 里还没有账号；先保存登录态会自动新建。</span></div>'
    return
  }
  $inject.disabled = false
  $injectList.classList.remove("hidden")
  $injectList.innerHTML = accounts
    .map(
      (a) =>
        '<label class="target"><input type="radio" name="inject-account" value="' +
        escapeHtml(a.id) +
        '"' +
        (a.hasSession ? "" : " disabled") +
        " />" +
        '<span class="uname">' +
        escapeHtml(a.username) +
        "</span>" +
        '<span class="meta">' +
        (a.hasSession ? "Bench 已存会话" : "Bench 无会话") +
        "</span></label>",
    )
    .join("")
}

/** 保存结果 → 文案。四种 outcome 各有明确下一步，不把空转报成成功。 */
function describeImport(data) {
  switch (data.outcome) {
    case "saved":
      return { text: "已保存：写入 " + data.cookieCount + " 条 Cookie。", kind: "ok" }
    case "empty":
      return {
        text: "没有读到该站点的登录态。请确认已在此浏览器登录该站点后重试。",
        kind: "warn",
      }
    case "unmatched":
      return { text: "Bench 里没有与该网址匹配的站点。", kind: "err" }
    case "noAccount":
      return { text: "该站点在 Bench 里还没有账号，请先在 Bench 添加账号。", kind: "err" }
    default:
      return { text: "结果：" + data.outcome, kind: "warn" }
  }
}

async function saveSession(force) {
  $save.disabled = true
  setMessage("读取中…")
  const res = await send({
    type: "bench:session:import",
    url: state.url,
    accountId: state.pendingAccountId || undefined,
    force: !!force,
  })
  $save.disabled = false
  if (!res.ok) {
    setMessage(res.error, "err")
    return
  }
  const data = res.data

  if (data.outcome === "conflict") {
    const at = data.existingCapturedAtTs
      ? new Date(data.existingCapturedAtTs * 1000).toLocaleString()
      : "未知时间"
    setMessage(
      "Bench 已有更新的会话（" + at + "）。继续会用当前浏览器的登录态覆盖它，且无法撤销。",
      "warn",
    )
    $targets.classList.remove("hidden")
    $targets.innerHTML = '<button id="force-save" class="btn">仍要覆盖</button>'
    document.getElementById("force-save").addEventListener("click", () => saveSession(true))
    return
  }

  if (data.outcome === "needTarget") {
    setMessage("该站点有多个账号，请选择要写入哪个：", "warn")
    $targets.classList.remove("hidden")
    $targets.innerHTML =
      (data.candidates || [])
        .map(
          (c) =>
            '<label class="target"><input type="radio" name="save-target" value="' +
            escapeHtml(c.id) +
            '" /><span class="uname">' +
            escapeHtml(c.username) +
            "</span></label>",
        )
        .join("") + '<button id="confirm-target" class="btn">保存到所选账号</button>'
    document.getElementById("confirm-target").addEventListener("click", () => {
      const picked = document.querySelector('input[name="save-target"]:checked')
      if (!picked) {
        setMessage("请先选择一个账号。", "warn")
        return
      }
      state.pendingAccountId = picked.value
      void saveSession(false)
    })
    return
  }

  const described = describeImport(data)
  setMessage(described.text, described.kind)
  if (data.outcome === "saved") {
    state.pendingAccountId = null
    await refreshSession() // 账号的 hasSession 变了，重取一次
  }
}

async function injectSession() {
  const picked = document.querySelector('input[name="inject-account"]:checked')
  if (!picked) {
    setMessage("请先选择要用哪个 Bench 账号登录。", "warn")
    return
  }
  $inject.disabled = true
  setMessage("注入中…（会先备份本浏览器该站点现有 Cookie）")
  const res = await send({ type: "bench:session:inject", accountId: picked.value, url: state.url })
  $inject.disabled = false
  if (!res.ok) {
    setMessage(res.error, "err")
    return
  }
  const data = res.data
  if (data.outcome === "noSession") {
    setMessage("该账号在 Bench 里还没有已保存的会话，请先在 Bench 中登录一次。", "err")
    return
  }
  if (data.outcome !== "injected") {
    setMessage("结果：" + data.outcome, "warn")
    return
  }
  const lines = [
    "已写入 " + data.written + " 条 Cookie（原站点已有 " + data.replaced + " 条，已备份）。",
  ]
  if (data.failed) lines.push("失败 " + data.failed + " 条。")
  if (data.storageOrigins > 0) {
    lines.push(
      "注意：该账号的登录态还包含本地存储（" +
        data.storageOrigins +
        " 个 origin），浏览器扩展无法写入 —— 若站点仍显示未登录，请在 Bench 里改用「浏览器实例」方式打开。",
    )
  }
  if (data.skippedPartitioned > 0) {
    lines.push("已跳过 " + data.skippedPartitioned + " 条分区隔离 Cookie。")
  }
  setMessage(lines.join("\n"), data.storageOrigins > 0 ? "warn" : "ok")
  await renderBackups()
}

async function renderBackups() {
  const res = await send({ type: "bench:session:backups" })
  if (!res.ok || !res.data.length) {
    $backups.classList.add("hidden")
    return
  }
  $backups.classList.remove("hidden")
  $backups.innerHTML =
    '<div class="slabel">可回滚的备份</div>' +
    res.data
      .map(
        (b) =>
          '<div class="bk"><span class="origin" title="' +
          escapeHtml(b.origin) +
          '">' +
          escapeHtml(b.origin) +
          "</span>" +
          '<span class="meta">' +
          b.count +
          " 条</span>" +
          '<a data-key="' +
          escapeHtml(b.key) +
          '">回滚</a></div>',
      )
      .join("")
  for (const link of $backups.querySelectorAll("a[data-key]")) {
    link.addEventListener("click", async () => {
      const key = link.getAttribute("data-key")
      const done = await send({ type: "bench:session:restore", key })
      if (!done.ok) {
        setMessage(done.error, "err")
        return
      }
      setMessage("已回滚 " + done.data.written + " 条 Cookie。", "ok")
      await renderBackups()
    })
  }
}

async function refreshSession() {
  const tab = await activeTab()
  state.url = tab && tab.url ? tab.url : null
  state.resolved = null
  if (!originOf(state.url)) {
    renderSession()
    return
  }
  const res = await send({ type: "bench:session:resolve", url: state.url })
  if (res.ok) state.resolved = res.data
  renderSession()
  if (!res.ok) setMessage(res.error, "err")
}

$save.addEventListener("click", () => void saveSession(false))
$inject.addEventListener("click", () => void injectSession())

document.getElementById("open-tab").addEventListener("click", (e) => {
  e.preventDefault()
  chrome.runtime.openOptionsPage()
})

document.getElementById("reconnect").addEventListener("click", async (e) => {
  e.preventDefault()
  const s = await send({ type: "bench:reconnect" })
  renderStatus({ connected: s.connected, lastError: s.lastError })
  await refreshSession()
})

// 初始化
;(async () => {
  const s = await send({ type: "bench:status" })
  renderStatus(s)
  await refreshSession()
  await renderBackups()
  if (s.connected) {
    const stats = await send({ type: "bench:invoke", cmd: "terminology_stats", params: {} })
    if (stats.ok && !stats.data.isEmpty) {
      $status.textContent = "已连接 · " + stats.data.termCount + " 条术语"
    }
  }
})()

/**
 * Bench Companion — popup。
 *
 * 内容：
 * 1. **站点登录态**（互通 I3 读 / I5 写）——把日常浏览器里已经登录好的站点
 *    会话交给 Bench（保存前需命名：站点标题 / 账号用户名），或把 Bench 里某账号
 *    的会话注入日常浏览器（会先备份、可一键回滚）。
 * 2. 备份列表（一个按钮 → 弹窗），支持一键回滚。
 */

const $status = document.getElementById("status")
const $site = document.getElementById("site")
const $msg = document.getElementById("session-msg")
const $save = document.getElementById("save")
const $targets = document.getElementById("targets")
const $inject = document.getElementById("inject")
const $injectList = document.getElementById("inject-list")
const $nameSite = document.getElementById("name-site")
const $nameAccount = document.getElementById("name-account")
const $siteLabel = document.getElementById("site-label")
const $accountLabel = document.getElementById("account-label")
const $backupsBtn = document.getElementById("backups-btn")
const $backupModal = document.getElementById("backup-modal")
const $backupModalList = document.getElementById("backup-modal-list")
const $backupClose = document.getElementById("backup-close")
const $version = document.getElementById("version")

// 版本号自证：用户据此与 Bench 导出面板展示的版本核对是否为同一次导出。
if ($version) $version.textContent = "v" + chrome.runtime.getManifest().version

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

const SAVE_LABEL = "保存此站点当前登录态"
const INJECT_LABEL = "用 Bench 账号注入此站点"

// ── 站点登录态 ───────────────────────────────────────────────

/** 当前活动标签页（需要 activeTab，由点击扩展图标触发授权）。 */
async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0] || null
}

const state = {
  url: null,
  resolved: null,
  pendingAccountId: null,
  stationTitle: null,
  username: null,
}

function originOf(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return parsed.origin
  } catch (e) {
    return null
  }
}

// Cookie 的 Domain 可能是当前 host 的父域（Trae 使用 .trae.cn）。
// 仅申请 www.trae.cn/* 会让 cookies.getAll({domain:"trae.cn"}) 仍被浏览器拒绝，
// 因此首次授权同时覆盖当前 host 与最多一级父域，权限仍保持按站点最小化。
function permissionOrigins(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return []
    const labels = parsed.hostname.split(".").filter(Boolean)
    const hosts = [parsed.hostname]
    if (labels.length > 2) hosts.push(labels.slice(1).join("."))
    // Trae 页面实际把鉴权请求发往 api.trae.cn；host-only Cookie 需要
    // 单独的 host 权限才能由 chrome.cookies 读取并写回默认浏览器。
    const normalized = parsed.hostname.toLowerCase().replace(/^\.+/, "")
    if (normalized === "trae.cn" || normalized.endsWith(".trae.cn")) hosts.push("api.trae.cn")
    return hosts.map((host) => parsed.protocol + "//" + host + "/*")
  } catch (_) {
    return []
  }
}

/** 从 URL 推断默认命名（去 www 的 host，如 github.com）。 */
function guessSiteName(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || ""
  } catch (e) {
    return ""
  }
}

function renderSession() {
  const resolved = state.resolved
  $targets.classList.add("hidden")
  $targets.innerHTML = ""
  $injectList.classList.add("hidden")
  $injectList.innerHTML = ""
  $inject.disabled = true

  if (!state.url) {
    $site.textContent = "—"
    $save.disabled = true
    $nameSite.disabled = true
    $nameSite.value = ""
    setMessage("请在一个 http(s) 网页上打开本面板。", "warn")
    return
  }
  $site.textContent = originOf(state.url) || state.url
  $site.title = state.url

  if (!resolved || !resolved.matched) {
    // 站点不存在：站点标题必填，账号用户名可留空（后端自动命名不重名账号），一并新建。
    $siteLabel.textContent = "站点标题（必填）"
    $accountLabel.textContent = "账号用户名（可选，留空自动命名）"
    $nameSite.disabled = false
    if (!$nameSite.value) $nameSite.value = state.stationTitle || guessSiteName(state.url)
    $save.disabled = false
    setMessage(
      "Bench 里还没有该网址对应的站点。填写站点标题后点下方按钮将新建站点并保存登录态（账号名留空会自动命名，不会重名）。",
      "warn",
    )
    return
  }

  const station = resolved.station
  const accounts = resolved.accounts || []
  // 已有站点：标题锁定为站点备注，不可修改。
  $siteLabel.textContent = "站点标题（已匹配站点，不可修改）"
  $nameSite.disabled = true
  $nameSite.value = station.remark || ""
  $save.disabled = false

  if (!accounts.length) {
    // 站点存在但无账号：用户名可留空，后端自动新建不重名账号。
    $accountLabel.textContent = "账号用户名（可选，留空自动命名）"
    $inject.disabled = true
    setMessage(
      "已匹配站点「" +
        station.remark +
        "」。该站点还没有账号，可直接保存，将自动新建一个不重名的账号。",
      "ok",
    )
    return
  }
  // 站点与账号齐备：用户名可留空（自动新建不重名账号），并可注入。
  $accountLabel.textContent = "账号用户名（可选，留空则自动新建不重名账号，不会覆盖已有账号）"
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
  setMessage("匹配站点：" + station.remark + "（" + resolved.confidence + "）", "ok")
}

/** 保存结果 → 文案。各 outcome 有明确下一步，不把空转报成成功。 */
function describeImport(data) {
  switch (data.outcome) {
    case "saved":
      return {
        text:
          "已保存" +
          (data.createdStation ? "：新建站点" : "") +
          (data.createdAccountId ? "：新建账号" : "") +
          "，写入 " +
          data.cookieCount +
          " 条 Cookie。",
        kind: "ok",
      }
    case "empty":
      return {
        text: "没有读到该站点的登录态。请确认已在此浏览器登录该站点后重试。",
        kind: "warn",
      }
    case "needStation":
      return { text: "需要填写站点标题（必填）后再保存。", kind: "warn" }
    case "needAccount":
      return { text: "该站点还没有账号，留空会自动新建不重名的账号，请重试。", kind: "warn" }
    case "unmatched":
      return { text: "Bench 里没有与该网址匹配的站点。", kind: "err" }
    case "noAccount":
      return { text: "该站点在 Bench 里还没有账号，请填写账号用户名。", kind: "err" }
    default:
      return { text: "结果：" + data.outcome, kind: "warn" }
  }
}

/** 点「保存此站点当前登录态」：按场景收集命名后导入。 */
async function saveSession(force) {
  const resolved = state.resolved
  const needStation = !resolved || !resolved.matched
  const title = $nameSite.value.trim()
  const username = $nameAccount.value.trim()
  // 站点标题必填；账号用户名可留空（后端自动新建不重名账号，绝不覆盖已有账号）。
  if (needStation && !title) {
    setMessage("请填写站点标题（必填）。", "err")
    $nameSite.focus()
    return
  }

  $save.textContent = "保存中…"
  $save.disabled = true
  setMessage("读取中…")
  let res
  try {
    const tab = await activeTab()
    if (!tab || !tab.id || !originOf(state.url)) {
      setMessage("请在目标站点页面打开扩展面板后重试。", "err")
      return
    }
    // optional_host_permissions 不能由 Bench 或 background 代为申请。
    // 必须在保存按钮的用户手势内申请，否则 cookies.getAll 会静默返回空数组，
    // Trae 等使用域级 Cookie 的站点会被误报为“没有登录态”。
    const origin = originOf(state.url)
    const permissionPatterns = permissionOrigins(state.url)
    let granted = false
    try {
      granted = await chrome.permissions.contains({ origins: permissionPatterns })
      if (!granted) granted = await chrome.permissions.request({ origins: permissionPatterns })
    } catch (_) {
      granted = false
    }
    if (!granted) {
      setMessage("未获得该站点访问权限，无法读取登录态。请允许扩展访问此站点后重试。", "err")
      return
    }
    const storageResult = await send({
      type: "bench:session:collectStorage",
      tabId: tab.id,
      url: state.url,
    })
    const storage = storageResult.ok ? storageResult.data : []
    res = await send({
      type: "bench:session:import",
      url: state.url,
      accountId: state.pendingAccountId || undefined,
      force: !!force,
      stationTitle: needStation ? title : undefined,
      username: username || undefined,
      storage,
    })
  } finally {
    $save.disabled = false
    $save.textContent = SAVE_LABEL
  }
  if (!res.ok) {
    setMessage(res.error, "err")
    return
  }
  const data = res.data

  // 兜底：resolve 已判定过，但后端仍要命名（并发变更等少见场景）时提示，不自动弹框。
  if (data.outcome === "needStation") {
    setMessage("请填写站点标题后再保存。", "warn")
    return
  }
  if (data.outcome === "needAccount") {
    setMessage("该站点还没有账号，重试时会自动新建不重名的账号。", "warn")
    return
  }

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
    state.stationTitle = null
    state.username = null
    $nameAccount.value = ""
    await refreshSession() // 账号的 hasSession / 站点匹配变了，重取一次
  }
}

async function injectSession() {
  const picked = document.querySelector('input[name="inject-account"]:checked')
  if (!picked) {
    setMessage("请先选择要用哪个 Bench 账号注入。", "warn")
    return
  }
  $inject.textContent = "注入中…"
  $inject.disabled = true
  setMessage("注入中…（会先备份本浏览器该站点现有 Cookie 与本地存储）")

  try {
    // 预检：该账号会话是否含本站点的存储载荷（Web Storage / IndexedDB）。
    // host 权限申请必须在本次点击的用户手势内完成（background 里调用 request
    // 会被 Chrome 拒绝）。
    let withStorage = false
    try {
      const preview = await send({
        type: "bench:session:storagePreview",
        accountId: picked.value,
        url: state.url,
      })
      if (
        preview.ok &&
        preview.data.outcome === "ok" &&
        (preview.data.hasWebStorage || preview.data.hasIndexedDb)
      ) {
        const origin = new URL(state.url).origin
        const granted = await chrome.permissions.request({ origins: permissionOrigins(state.url) })
        if (granted) {
          withStorage = true
        } else {
          setMessage("未授权站点访问：本次仅注入 Cookie，本地存储与 IndexedDB 保持不变。", "warn")
        }
      }
    } catch (e) {
      // 预检失败不阻断注入（Cookie 仍可写），storage 视为不可用。
    }

    const res = await send({
      type: "bench:session:inject",
      accountId: picked.value,
      url: state.url,
      withStorage,
    })
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
    const ua = data.uaOverride || {}
    if (ua.active) {
      lines.push("已启用站点 UA 指纹覆写：该站点的会话建立于其他浏览器内核，请求将携带原会话 UA。")
    }
    if (ua.error) lines.push("UA 指纹覆写失败：" + ua.error)
    const storage = data.storage || {}
    if (storage.attempted && storage.granted && storage.writtenKeys > 0) {
      lines.push(
        "已写入本地存储 " +
          storage.writtenKeys +
          " 个键（localStorage " +
          storage.writtenLocal +
          " + sessionStorage " +
          storage.writtenSession +
          "），页面已刷新。",
      )
    }
    if (storage.attempted && storage.error) {
      lines.push("本地存储写入失败：" + storage.error)
    }
    const idb = storage.indexedDb || {}
    if (idb.attempted && idb.restored > 0) {
      lines.push("已恢复 IndexedDB " + idb.restored + " 个库（注入前已备份，可回滚）。")
    }
    if (idb.attempted && idb.failed?.length) {
      lines.push(
        "IndexedDB 部分库未恢复：" +
          idb.failed.map((f) => f.name + "（" + f.code + "）").join("、"),
      )
    }
    if (idb.attempted && !idb.backedUp && !idb.error) {
      lines.push("IndexedDB 现有数据未能完整备份，已跳过覆盖（保持原样）。")
    }
    if (idb.error) {
      lines.push("IndexedDB 未写入：" + idb.error + "。可改用 Bench 隔离实例同步。")
    }
    const storageIncomplete =
      storage.attempted &&
      ((!storage.granted && storage.writtenKeys === 0 && !idb.restored) ||
        storage.error ||
        idb.error ||
        (idb.failed?.length || 0) > 0)
    if (data.storageOrigins > 0 && !storage.writtenKeys && !idb.restored) {
      lines.push(
        "注意：该账号的登录态还包含本地存储" +
          (storage.attempted && !storage.granted ? "（本次未授权写入）" : "") +
          "。若站点仍显示未登录，请核对上方存储写入明细，或改用「Bench 隔离实例」方式同步。",
      )
    }
    if (data.skippedPartitioned > 0) {
      lines.push("已跳过 " + data.skippedPartitioned + " 条分区隔离 Cookie。")
    }
    setMessage(lines.join("\n"), storageIncomplete ? "warn" : "ok")
  } finally {
    $inject.disabled = false
    $inject.textContent = INJECT_LABEL
  }
}

// ── 备份列表弹窗 ─────────────────────────────────────────────

function closeBackupModal() {
  $backupModal.classList.add("hidden")
}

/** 渲染弹窗内的备份列表；回滚成功后刷新列表。 */
async function renderBackupList() {
  const res = await send({ type: "bench:session:backups" })
  if (!res.ok) {
    $backupModalList.innerHTML = '<div class="empty">' + escapeHtml(res.error) + "</div>"
    return
  }
  if (!res.data.length) {
    $backupModalList.innerHTML = '<div class="empty">暂无可回滚的备份</div>'
    return
  }
  $backupModalList.innerHTML = res.data
    .map((b) => {
      const meta =
        b.count +
        " 条" +
        (b.storageKeys ? " + " + b.storageKeys + " 个存储键" : "") +
        (b.idbDatabases ? " + " + b.idbDatabases + " 个 IndexedDB 库" : "")
      return (
        '<div class="bk"><span class="origin" title="' +
        escapeHtml(b.origin) +
        '">' +
        escapeHtml(b.origin) +
        "</span>" +
        '<span class="meta">' +
        escapeHtml(meta) +
        "</span>" +
        '<a data-key="' +
        escapeHtml(b.key) +
        '">回滚</a></div>'
      )
    })
    .join("")
  for (const link of $backupModalList.querySelectorAll("a[data-key]")) {
    link.addEventListener("click", async () => {
      const key = link.getAttribute("data-key")
      const done = await send({ type: "bench:session:restore", key })
      if (!done.ok) {
        setMessage(done.error, "err")
        return
      }
      const parts = ["已回滚 " + done.data.written + " 条 Cookie。"]
      if (done.data.storageWritten > 0)
        parts.push("本地存储 " + done.data.storageWritten + " 个键。")
      if (done.data.storageWritten < 0)
        parts.push("本地存储未回滚（未授权该站点，可在注入流程中授权后重试）。")
      if (done.data.idbRestored > 0) parts.push("IndexedDB " + done.data.idbRestored + " 个库。")
      if (done.data.idbRestored < 0) parts.push("IndexedDB 未回滚（未授权该站点）。")
      if (done.data.idbFailed?.length)
        parts.push("IndexedDB 部分库失败：" + done.data.idbFailed.map((f) => f.name).join("、"))
      setMessage(parts.join(" "), "ok")
      await renderBackupList()
    })
  }
}

$backupsBtn.addEventListener("click", async () => {
  $backupModalList.innerHTML = '<div class="empty">加载中…</div>'
  $backupModal.classList.remove("hidden")
  await renderBackupList()
})
$backupClose.addEventListener("click", closeBackupModal)
$backupModal.addEventListener("click", (e) => {
  if (e.target === $backupModal) closeBackupModal()
})

// ── 刷新 / 事件 ──────────────────────────────────────────────

async function refreshSession() {
  const tab = await activeTab()
  const next = tab && tab.url ? tab.url : null
  if (next !== state.url) {
    // 切到别的站点：清掉上一次的命名与目标账号。
    state.pendingAccountId = null
    state.stationTitle = null
    state.username = null
    $nameSite.value = ""
    $nameAccount.value = ""
  }
  state.url = next
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
$nameSite.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $save.click()
})
$nameAccount.addEventListener("keydown", (e) => {
  if (e.key === "Enter") $save.click()
})

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
})()

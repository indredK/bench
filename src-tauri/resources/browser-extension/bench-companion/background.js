/**
 * Bench Companion — background service worker (MV3)。
 *
 * 职责：
 * 1. 维护与本机 bench-host（Native Messaging, com.kindred.bench）的长连接；
 * 2. 为 popup / tab 页代理 invoke 请求（Native Messaging 只能在
 *    扩展后台与扩展页面中使用，这里统一走 background）；
 * 3. 能力探测：bench-host 不可用时回执 degraded 状态，UI 据此降级。
 *
 * 通道：service_worker ↔ popup/tab 使用 chrome.runtime 消息；
 *       background ↔ bench-host 使用 chrome.runtime.connectNative。
 */

const NATIVE_HOST = "com.kindred.bench"

let nativePort = null
let lastError = null
let pending = new Map() // id -> { resolve, reject, timer }
let seq = 0

function connectNative() {
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST)
    port.onMessage.addListener((msg) => {
      const entry = pending.get(msg.id)
      if (!entry) return
      clearTimeout(entry.timer)
      pending.delete(msg.id)
      if (msg.ok) entry.resolve(msg.data)
      else entry.reject(new Error(msg.error || "host error"))
    })
    port.onDisconnect.addListener(() => {
      // 常见原因：host 未注册 / allowed_origins 不匹配 / Bench 未安装
      lastError = chrome.runtime.lastError?.message || null
      nativePort = null
      for (const [, entry] of pending) {
        clearTimeout(entry.timer)
        entry.reject(new Error("HOST_DISCONNECTED: " + (lastError || "native host closed")))
      }
      pending.clear()
    })
    lastError = null
    nativePort = port
  } catch (e) {
    lastError = e?.message || String(e)
    nativePort = null
  }
}

function ensurePort() {
  if (!nativePort) connectNative()
  return nativePort
}

/**
 * 调用 bench-host 的一个命令。
 * @param {string} cmd dispatcher 命令名（见 bench-host tools）
 * @param {object} [params]
 * @param {number} [timeoutMs]
 */
function invoke(cmd, params = {}, timeoutMs = 30000) {
  const port = ensurePort()
  if (!port) {
    return Promise.reject(
      new Error("HOST_UNAVAILABLE: " + (lastError || "cannot connect to " + NATIVE_HOST)),
    )
  }
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error("TIMEOUT: " + cmd))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    try {
      port.postMessage({ id, cmd, params })
    } catch (e) {
      clearTimeout(timer)
      pending.delete(id)
      reject(new Error("POST_FAILED: " + (e?.message || e)))
    }
  })
}

// —— 消息网关（popup / tab → background）——
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "bench:status") {
    sendResponse({
      connected: !!nativePort,
      host: NATIVE_HOST,
      lastError,
      degraded: nativePort
        ? []
        : [
            "terminology_search",
            "terminology_list_industries",
            "terminology_stats",
            "clean_space_scan_custom_folder",
            "photo_triage_album_summary",
            "photo_triage_scan",
          ],
    })
    return false
  }
  if (msg?.type === "bench:reconnect") {
    if (nativePort) {
      nativePort.disconnect()
      nativePort = null
    }
    connectNative()
    sendResponse({ connected: !!nativePort, lastError })
    return false
  }
  if (msg?.type === "bench:invoke") {
    invoke(msg.cmd, msg.params || {}, msg.timeoutMs)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }))
    return true // 异步响应
  }

  // ── 会话互通（I3 读 / I5 写）────────────────────────────────────────────
  // 全部经「本地桥」直达 Bench app：明文会话只在 浏览器进程 → loopback →
  // Rust 内存 → 加密 store 之间流转，**不经过 bench-host 进程**。
  const sessionHandlers = {
    "bench:session:resolve": () => resolveSite(msg.url),
    "bench:session:import": () => importSession(msg),
    "bench:session:export": () => exportSession(msg.accountId),
    "bench:session:storagePreview": () => storagePreview(msg),
    "bench:session:inject": () => injectSession(msg),
    "bench:session:backups": () => listBackups(),
    "bench:session:restore": () => restoreBackup(msg.key),
  }
  const handler = sessionHandlers[msg?.type]
  if (handler) {
    handler()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }))
    return true
  }
  return false
})

// ═══════════════════════════════════════════════════════════════════════════
// 会话互通：本地桥客户端 + cookie 读写 + 覆盖前备份
//
// 设计约束（对应 docs/explanation/browser-session-extension-plan.md §3.2）：
// 1. 桥参数（端口 + 一次性 token）只经 Native Messaging 取回 —— NM host 的
//    allowed_origins 写死了本扩展 ID，等于由 Chromium 保证只有本扩展能拿到；
// 2. 401 时清缓存重取一次，覆盖「Bench 重启换了 token」这一常见情形；
// 3. 写入日常浏览器前**必须**把该站点现有 cookie 备份进 chrome.storage.local，
//    让用户可一键回滚 —— 这是 I5 能上线的先决条件。
// ═══════════════════════════════════════════════════════════════════════════

let bridgeCache = null

async function bridgeDescriptor(force) {
  if (bridgeCache && !force) return bridgeCache
  const raw = await invoke("browser_bridge_descriptor", {})
  bridgeCache = raw && raw.port ? raw : null
  return bridgeCache
}

async function bridgeCall(path, body, allowRetry = true) {
  const descriptor = await bridgeDescriptor(false)
  if (!descriptor) {
    throw new Error("BRIDGE_UNAVAILABLE: 请在 Bench 中执行「导出浏览器扩展」以启动本地桥")
  }
  let response
  try {
    response = await fetch("http://127.0.0.1:" + descriptor.port + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bench-token": descriptor.token },
      body: JSON.stringify(body || {}),
    })
  } catch (e) {
    // 连接失败：多半是描述文件属于上一次 app 运行（端口已失效）。
    if (allowRetry) {
      bridgeCache = null
      return bridgeCall(path, body, false)
    }
    throw new Error("BRIDGE_UNREACHABLE: 请确认 Bench 正在运行")
  }
  const payload = await response.json().catch(() => null)
  if (response.status === 401 && allowRetry) {
    // token 属于上一次 app 运行：重取描述后再试一次。
    bridgeCache = null
    return bridgeCall(path, body, false)
  }
  if (!payload || payload.ok !== true) {
    throw new Error((payload && payload.error) || "BRIDGE_HTTP_" + response.status)
  }
  return payload.data
}

/**
 * 该 host 的候选域（自身 + 逐级去掉子域，最多到两级标签）。
 * 不是严格的公共后缀解析：宁可多取几层，Rust 侧会按站点可注册域再过滤一次。
 */
function candidateDomains(host) {
  const parts = String(host || "")
    .split(".")
    .filter(Boolean)
  const out = []
  for (let i = 0; i + 2 <= parts.length && i <= 1; i += 1) {
    out.push(parts.slice(i).join("."))
  }
  if (!out.length && host) out.push(String(host))
  return out
}

/** 采集该 URL 的 cookie（含 HttpOnly）；跨域去重。 */
async function collectCookies(url) {
  const origin = new URL(url).origin
  const host = new URL(url).hostname
  const seen = new Map()
  const queries = [{ url: origin }]
  for (const domain of candidateDomains(host)) queries.push({ domain })

  for (const query of queries) {
    let batch = []
    try {
      batch = await chrome.cookies.getAll(query)
    } catch (e) {
      // 缺 host 权限时 continue：让上层把「需要授权」暴露给用户，而不是整体失败。
      continue
    }
    for (const cookie of batch) {
      const key = [
        cookie.name,
        cookie.domain,
        cookie.path,
        cookie.storeId,
        cookie.partitionKey ? "p" : "",
      ].join("\u0000")
      seen.set(key, cookie)
    }
  }
  return Array.from(seen.values())
}

async function resolveSite(url) {
  return bridgeCall("/v1/site/resolve", { url })
}

/** I3：把当前页的登录态交给 Bench。 */
async function importSession({ url, accountId, force }) {
  const cookies = await collectCookies(url)
  return bridgeCall("/v1/session/import", {
    url,
    accountId: accountId || undefined,
    force: !!force,
    cookies,
    userAgent: navigator.userAgent,
  })
}

/** I5 第一步：取回 Bench 里该账号的会话载荷（只回给本扩展）。 */
async function exportSession(accountId) {
  return bridgeCall("/v1/session/export", { accountId })
}

/** 注入预检：该账号会话在本站点是否有可写的 Web Storage 载荷（不回传载荷本身）。 */
async function storagePreview({ accountId, url }) {
  const exported = await exportSession(accountId)
  if (exported.outcome !== "ok") return { outcome: exported.outcome }
  const origin = new URL(url).origin
  const branch = (exported.webStorage || []).find((item) => item.origin === origin)
  const localKeys = (branch?.localStorage || []).length
  const sessionKeys = (branch?.sessionStorage || []).length
  return {
    outcome: "ok",
    hasWebStorage: localKeys + sessionKeys > 0,
    localKeys,
    sessionKeys,
    storageOrigins: exported.storageOrigins || 0,
  }
}

/** 打开（或复用）一个指向 origin 的标签页并等待加载完成，返回 tabId。 */
async function openAndWaitTab(url, timeoutMs = 20000) {
  const tab = await chrome.tabs.create({ url, active: false })
  await new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    const listener = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === "complete") finish()
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
  return tab.id
}

/**
 * 把 Bench 账号的 Web Storage 写进本站点（v0.3 新能力）。
 *
 * 顺序：备份现有 localStorage/sessionStorage → 在页面上下文执行覆盖写入 →
 * 重载页面使站点读到新存储。执行器与 Bench 的恢复脚本（browser_storage
 * `RESTORE_SCRIPT_TEMPLATE` 的 Web Storage 分支）行为一致，双端以载荷 JSON
 * `{origin, localStorage:[{name,value}], sessionStorage:[{name,value}]}` 为唯一
 * schema 锚点，改动必须两处同步。IndexedDB 刻意不注入（无法廉价备份）。
 */
async function injectWebStorage(origin, branch) {
  const tabId = await openAndWaitTab(origin + "/")
  const backupResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
    }),
  })
  const backup = backupResult?.[0]?.result || { localStorage: {}, sessionStorage: {} }

  const writeResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: (payload) => {
      localStorage.clear()
      for (const entry of payload.localStorage) localStorage.setItem(entry.name, entry.value)
      sessionStorage.clear()
      for (const entry of payload.sessionStorage) sessionStorage.setItem(entry.name, entry.value)
      return {
        writtenLocal: payload.localStorage.length,
        writtenSession: payload.sessionStorage.length,
        replacedLocal: Object.keys(localStorage).length,
      }
    },
    args: [branch],
  })
  const written = writeResult?.[0]?.result || { writtenLocal: 0, writtenSession: 0 }
  await chrome.tabs.reload(tabId)
  return {
    writtenKeys: written.writtenLocal + written.writtenSession,
    writtenLocal: written.writtenLocal,
    writtenSession: written.writtenSession,
    backup,
  }
}

const BACKUP_PREFIX = "bench:backup:"

/** I5 第二步：先备份该站点现有登录态（Cookie + Web Storage），再逐条写入。 */
async function injectSession({ accountId, url, withStorage }) {
  const exported = await exportSession(accountId)
  if (exported.outcome !== "ok") return exported

  const origin = new URL(url).origin
  const existing = await collectCookies(url)
  const backupKey = BACKUP_PREFIX + origin
  const backup = { at: Date.now(), origin, cookies: existing }

  let written = 0
  let failed = 0
  for (const cookie of exported.cookies || []) {
    const details = {
      url: origin,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || "/",
      secure: !!cookie.secure,
      httpOnly: !!cookie.httpOnly,
    }
    // host-only 必须靠 url 推导域，传 domain 会被浏览器拒绝或写成域级 cookie。
    if (!cookie.hostOnly && cookie.domain) details.domain = cookie.domain
    if (cookie.expirationDate) details.expirationDate = cookie.expirationDate
    if (cookie.sameSite && cookie.sameSite !== "unspecified") details.sameSite = cookie.sameSite
    try {
      await chrome.cookies.set(details)
      written += 1
    } catch (e) {
      failed += 1
    }
  }

  // Web Storage 注入（v0.3）：host 权限必须在 popup 的用户手势里申请完毕，
  // 这里只检查是否已授予；未授予则降级为「仅 Cookie」并在结果里说明。
  const storage = {
    attempted: false,
    granted: false,
    writtenKeys: 0,
    writtenLocal: 0,
    writtenSession: 0,
    error: null,
  }
  const branch = (exported.webStorage || []).find((item) => item.origin === origin)
  if (withStorage && branch) {
    const keys = (branch.localStorage || []).length + (branch.sessionStorage || []).length
    if (keys > 0) {
      storage.attempted = true
      try {
        storage.granted = await chrome.permissions.contains({
          origins: [origin + "/*"],
        })
      } catch (e) {
        storage.granted = false
      }
      if (storage.granted) {
        try {
          const result = await injectWebStorage(origin, branch)
          storage.writtenKeys = result.writtenKeys
          storage.writtenLocal = result.writtenLocal
          storage.writtenSession = result.writtenSession
          backup.webStorage = result.backup
        } catch (e) {
          storage.error = String(e?.message || e)
        }
      }
    }
  }
  await chrome.storage.local.set({ [backupKey]: backup })

  return {
    outcome: "injected",
    origin,
    written,
    failed,
    backupKey,
    replaced: existing.length,
    // > 0 表示该账号的登录态还含本地存储（扩展无法写入），必须提示用户。
    storageOrigins: exported.storageOrigins || 0,
    skippedPartitioned: exported.skippedPartitioned || 0,
    storage,
  }
}

async function listBackups() {
  const all = await chrome.storage.local.get(null)
  return Object.keys(all)
    .filter((key) => key.startsWith(BACKUP_PREFIX))
    .map((key) => ({
      key,
      origin: all[key]?.origin || "",
      at: all[key]?.at || 0,
      count: (all[key]?.cookies || []).length,
      storageKeys: Object.keys(all[key]?.webStorage?.localStorage || {}).length,
    }))
    .sort((a, b) => b.at - a.at)
}

/** 把某站点现有 Web Storage 写回（回滚）。返回写入键数；站点页未授权时返回 -1。 */
async function restoreWebStorage(origin, webStorage) {
  const localEntries = Object.entries(webStorage?.localStorage || {})
  const sessionEntries = Object.entries(webStorage?.sessionStorage || {})
  if (localEntries.length + sessionEntries.length === 0) return 0
  const granted = await chrome.permissions.contains({ origins: [origin + "/*"] })
  if (!granted) return -1
  const tabId = await openAndWaitTab(origin + "/")
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: (payload) => {
      localStorage.clear()
      for (const [name, value] of payload.local) localStorage.setItem(name, value)
      sessionStorage.clear()
      for (const [name, value] of payload.session) sessionStorage.setItem(name, value)
      return payload.local.length + payload.session.length
    },
    args: [{ local: localEntries, session: sessionEntries }],
  })
  await chrome.tabs.reload(tabId)
  return result?.[0]?.result ?? 0
}

/** 回滚：把备份里的 Cookie 与 Web Storage 写回，并清掉备份。 */
async function restoreBackup(key) {
  if (!key || !key.startsWith(BACKUP_PREFIX)) throw new Error("BAD_BACKUP_KEY")
  const all = await chrome.storage.local.get(key)
  const backup = all[key]
  if (!backup) throw new Error("BACKUP_NOT_FOUND")
  let written = 0
  for (const cookie of backup.cookies || []) {
    const details = {
      url: backup.origin,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path || "/",
      secure: !!cookie.secure,
      httpOnly: !!cookie.httpOnly,
    }
    // 带前导点 = 域级 cookie，必须显式传 domain；否则靠 url 推导为 host-only。
    if (String(cookie.domain || "").startsWith(".")) details.domain = cookie.domain
    if (cookie.expirationDate) details.expirationDate = cookie.expirationDate
    try {
      await chrome.cookies.set(details)
      written += 1
    } catch (e) {
      /* 单条失败不中断整体回滚 */
    }
  }
  const storageWritten = await restoreWebStorage(backup.origin, backup.webStorage)
  await chrome.storage.local.remove(key)
  return { written, storageWritten }
}

// SW 冷启动即尝试连接（首次消息到达时也会 lazy connect）
connectNative()

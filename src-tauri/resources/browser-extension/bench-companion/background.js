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
    "bench:session:pendingCheck": () => maybeAutoInject(),
    "bench:session:overview": () => bridgeCall("/v1/interop/overview", {}),
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

// ── 会话环境一致性（UA 覆写，业内指纹浏览器的标准做法）──────────────────
// 会话建立于某个浏览器内核（如 Bench 内置 WKWebView 的 Safari UA），注入到
// 用户日常 Chrome 后 UA 不一致——绑定 UA/设备的服务端会把会话判为异常。
// 用 declarativeNetRequest session rule 把该站点的 User-Agent 请求头覆写为
// 会话原始 UA，作用域限定目标站点域；回滚时一并移除。

const UA_RULE_BASE = 500000

function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * 为站点注册 UA 覆写（会话 UA ≠ 当前浏览器 UA 时）。
 * 返回 { active }；注册失败不阻断注入（降级为纯 Cookie+存储写入）。
 */
async function applyUaOverride(origin, userAgent) {
  if (!userAgent || userAgent === navigator.userAgent) return { active: false }
  const host = new URL(origin).hostname.replace(/^www\./, "")
  const ruleId = UA_RULE_BASE + (hashString(host) % 100000)
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [
        {
          id: ruleId,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [{ header: "User-Agent", operation: "set", value: userAgent }],
          },
          condition: {
            requestDomains: [host],
            resourceTypes: [
              "main_frame",
              "sub_frame",
              "xmlhttprequest",
              "script",
              "stylesheet",
              "image",
              "font",
              "other",
            ],
          },
        },
      ],
    })
    await chrome.storage.local.set({
      ["bench:ua-rule:" + origin]: { origin, ruleId, host, userAgent, at: Date.now() },
    })
    return { active: true }
  } catch (e) {
    return { active: false, error: String(e?.message || e) }
  }
}

/** 移除站点的 UA 覆写（回滚时调用）。 */
async function removeUaOverride(origin) {
  const key = "bench:ua-rule:" + origin
  const all = await chrome.storage.local.get(key)
  const record = all[key]
  if (!record) return
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [record.ruleId] })
  } catch (e) {
    /* 规则可能已被清理 */
  }
  await chrome.storage.local.remove(key)
}

/** 注入预检：该账号会话在本站点是否有可写的存储载荷（不回传载荷本身）。 */
async function storagePreview({ accountId, url }) {
  const exported = await exportSession(accountId)
  if (exported.outcome !== "ok") return { outcome: exported.outcome }
  const origin = new URL(url).origin
  const branch = (exported.webStorage || []).find((item) => item.origin === origin)
  const localKeys = (branch?.localStorage || []).length
  const sessionKeys = (branch?.sessionStorage || []).length
  // 含有 object store 的库才会在注入时被实际写入，空的库壳不计。
  const indexedDbDatabases = (branch?.indexedDb?.databases || []).filter(
    (db) => (db.stores || []).length > 0,
  ).length
  return {
    outcome: "ok",
    hasWebStorage: localKeys + sessionKeys > 0,
    hasIndexedDb: indexedDbDatabases > 0,
    localKeys,
    sessionKeys,
    indexedDbDatabases,
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
 * 把 Bench 账号的存储写进本站点（v0.5：localStorage / sessionStorage / IndexedDB）。
 *
 * 顺序：备份现有 localStorage/sessionStorage → 覆盖写入 → 备份现有 IndexedDB →
 * 恢复 IndexedDB → 重载页面使站点读到新存储。执行器与 Bench 的恢复脚本
 *（browser_storage `RESTORE_SCRIPT_TEMPLATE`）及采集脚本
 *（`CAPTURE_SCRIPT_TEMPLATE` 的 IndexedDB 分支）行为一致，双端以载荷 JSON
 * `{origin, localStorage:[{name,value}], sessionStorage:[{name,value}], indexedDb}`
 * 为唯一 schema 锚点，改动必须三处同步（Rust 采集 / Rust 恢复模板 / 本文件）。
 *
 * IndexedDB 的安全纪律（v0.5 起支持注入的前提）：
 * 1. 写入前先快照该站点现有 IndexedDB（与 Bench 采集端同构的编码）存入
 *    `chrome.storage.local`（`unlimitedStorage` 解除体积顾虑），可一键回滚；
 * 2. 快照不完整（limited / failed / 不支持）→ **拒绝覆盖**（fail-closed），
 *    IndexedDB 保持原样并在结果里说明；
 * 3. 单个库恢复失败（版本 / schema 不一致、被其他连接阻塞）只记入 failed
 *    列表，不阻断其他库，也不阻断整体注入。
 */
async function injectWebStorage(origin, branch) {
  // 优先复用该站点已存在的标签页（手动注入=用户当前页；自动注入=Bench 打开的页），
  // 避免额外开后台标签；没有才新开。
  let tabId = (await findTabByOrigin(origin))?.id
  if (!tabId) tabId = await openAndWaitTab(origin + "/")
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

  // ── IndexedDB（v0.5）：先备份后覆盖，页面上下文执行 ──
  const idb = { attempted: false, backedUp: false, restored: 0, failed: [], error: null }
  const idbPayload = branch.indexedDb
  if (idbPayload && (idbPayload.databases || []).length > 0) {
    idb.attempted = true
    try {
      const captured = await executeInPage(tabId, IDB_CAPTURE_FUNC, [])
      if (captured?.status === "complete") {
        idb.backedUp = true
        backup.indexedDb = captured.snapshot
        const restored = await executeInPage(tabId, IDB_RESTORE_FUNC, [idbPayload])
        idb.restored = (restored?.restored || []).length
        idb.failed = restored?.failed || []
      } else if (captured?.status === "unsupported") {
        idb.error = "INDEXED_DB_UNSUPPORTED"
      } else {
        // 备份不完整（limited / failed）：拒绝覆盖用户现有数据。
        idb.error =
          captured?.status === "limited" ? "INDEXED_DB_BACKUP_LIMITED" : "INDEXED_DB_BACKUP_FAILED"
      }
    } catch (e) {
      idb.error = String(e?.message || e)
    }
  }

  await chrome.tabs.reload(tabId)
  return {
    writtenKeys: written.writtenLocal + written.writtenSession,
    writtenLocal: written.writtenLocal,
    writtenSession: written.writtenSession,
    idb,
    backup,
  }
}

/** 在页面上下文（MAIN world）执行一个自包含函数并等待其 Promise 完成。 */
async function executeInPage(tabId, func, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
    args,
  })
  return results?.[0]?.result
}

/**
 * IndexedDB 快照（备份用）。在页面上下文执行，编码与 Bench 采集端
 *（browser_storage.rs `CAPTURE_SCRIPT_TEMPLATE`）完全一致：值统一编码为
 * `{t, v}` 标签结构，保证 JSON 可序列化且回滚时可精确还原类型。
 */
const IDB_CAPTURE_FUNC = () =>
  (async () => {
    const MAX_DATABASES = 32,
      MAX_STORES = 128,
      MAX_RECORDS = 10000,
      MAX_INDEXED_DB_BYTES = 8388608
    const bytesToBase64 = (bytes) => {
      let binary = ""
      for (let i = 0; i < bytes.length; i += 32768) {
        binary += String.fromCharCode.apply(
          null,
          bytes.subarray(i, Math.min(i + 32768, bytes.length)),
        )
      }
      return btoa(binary)
    }
    const encode = (value, seen, depth) => {
      if (depth > 64) throw new Error("INDEXED_DB_VALUE_DEPTH_LIMIT")
      if (value === null) return { t: "null" }
      const type = typeof value
      if (type === "string" || type === "boolean") return { t: type, v: value }
      if (type === "undefined") return { t: "undefined" }
      if (type === "number") {
        if (Number.isNaN(value)) return { t: "number", v: "NaN" }
        if (value === Infinity) return { t: "number", v: "Infinity" }
        if (value === -Infinity) return { t: "number", v: "-Infinity" }
        if (Object.is(value, -0)) return { t: "number", v: "-0" }
        return { t: "number", v: value }
      }
      if (type === "bigint") return { t: "bigint", v: String(value) }
      if (type !== "object") throw new Error("INDEXED_DB_VALUE_TYPE_UNSUPPORTED")
      if (seen.has(value)) throw new Error("INDEXED_DB_CIRCULAR_VALUE_UNSUPPORTED")
      seen.add(value)
      try {
        if (value instanceof Date) return { t: "date", v: value.toISOString() }
        if (value instanceof RegExp) return { t: "regexp", v: value.source, f: value.flags }
        if (value instanceof ArrayBuffer)
          return { t: "arrayBuffer", v: bytesToBase64(new Uint8Array(value)) }
        if (ArrayBuffer.isView(value))
          return {
            t: "typedArray",
            c: value.constructor.name,
            v: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
          }
        if (Array.isArray(value))
          return { t: "array", v: value.map((item) => encode(item, seen, depth + 1)) }
        if (value instanceof Map)
          return {
            t: "map",
            v: Array.from(value.entries(), ([k, v]) => [
              encode(k, seen, depth + 1),
              encode(v, seen, depth + 1),
            ]),
          }
        if (value instanceof Set)
          return {
            t: "set",
            v: Array.from(value.values(), (item) => encode(item, seen, depth + 1)),
          }
        const proto = Object.getPrototypeOf(value)
        if (proto !== Object.prototype && proto !== null)
          throw new Error("INDEXED_DB_VALUE_TYPE_UNSUPPORTED")
        return {
          t: "object",
          v: Object.keys(value).map((key) => [key, encode(value[key], seen, depth + 1)]),
        }
      } finally {
        seen.delete(value)
      }
    }
    const request = (req) =>
      new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error || new Error("INDEXED_DB_REQUEST_FAILED"))
      })
    const transactionDone = (tx) =>
      new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onabort = () => reject(tx.error || new Error("INDEXED_DB_TRANSACTION_ABORTED"))
        tx.onerror = () => reject(tx.error || new Error("INDEXED_DB_TRANSACTION_FAILED"))
      })
    const openExisting = (name) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(name)
        let created = false
        req.onupgradeneeded = () => {
          created = req.oldVersion === 0
          try {
            req.transaction.abort()
          } catch (_) {}
        }
        req.onsuccess = () => {
          if (created) {
            req.result.close()
            reject(new Error("INDEXED_DB_CHANGED_DURING_CAPTURE"))
          } else resolve(req.result)
        }
        req.onerror = () => reject(req.error || new Error("INDEXED_DB_OPEN_FAILED"))
        req.onblocked = () => reject(new Error("INDEXED_DB_BLOCKED"))
      })
    if (!globalThis.indexedDB || typeof indexedDB.databases !== "function")
      return { status: "unsupported" }
    try {
      const infos = (await indexedDB.databases()).filter(
        (info) => typeof info.name === "string" && info.name.length > 0,
      )
      if (infos.length > MAX_DATABASES) return { status: "limited" }
      const databases = []
      let totalStores = 0,
        totalRecords = 0
      for (const info of infos) {
        const db = await openExisting(info.name)
        try {
          const storeNames = Array.from(db.objectStoreNames)
          totalStores += storeNames.length
          if (totalStores > MAX_STORES) return { status: "limited" }
          if (storeNames.length === 0) {
            databases.push({ name: db.name, version: db.version, stores: [] })
            continue
          }
          const tx = db.transaction(storeNames, "readonly")
          const stores = storeNames.map((name) => {
            const store = tx.objectStore(name)
            const indexes = Array.from(store.indexNames, (indexName) => {
              const index = store.index(indexName)
              return {
                name: index.name,
                keyPath: index.keyPath,
                unique: index.unique,
                multiEntry: index.multiEntry,
              }
            })
            const records = []
            const read = new Promise((resolve, reject) => {
              const cursorRequest = store.openCursor()
              cursorRequest.onerror = () =>
                reject(cursorRequest.error || new Error("INDEXED_DB_CURSOR_FAILED"))
              cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result
                if (!cursor) {
                  resolve()
                  return
                }
                totalRecords++
                if (totalRecords > MAX_RECORDS) {
                  reject(new Error("INDEXED_DB_RECORD_LIMIT"))
                  return
                }
                records.push({
                  key: encode(cursor.primaryKey, new Set(), 0),
                  value: encode(cursor.value, new Set(), 0),
                })
                cursor.continue()
              }
            })
            return {
              metadata: {
                name: store.name,
                keyPath: store.keyPath,
                autoIncrement: store.autoIncrement,
                indexes,
              },
              records,
              read,
            }
          })
          await Promise.all(stores.map((store) => store.read))
          await transactionDone(tx)
          databases.push({
            name: db.name,
            version: db.version,
            stores: stores.map(({ metadata, records }) => ({ ...metadata, records })),
          })
        } finally {
          db.close()
        }
      }
      const snapshot = { version: 1, databases }
      if (JSON.stringify(snapshot).length * 2 > MAX_INDEXED_DB_BYTES) return { status: "limited" }
      return { status: "complete", snapshot }
    } catch (error) {
      const code =
        error && typeof error.message === "string" ? error.message : "INDEXED_DB_CAPTURE_FAILED"
      if (code.includes("LIMIT")) return { status: "limited" }
      return { status: "failed" }
    }
  })()

/**
 * IndexedDB 恢复（注入 / 回滚共用）。在页面上下文执行，语义与 Bench 的
 * `RESTORE_SCRIPT_TEMPLATE.restoreDatabase` 一致，差异仅两点：
 * 1. 单库失败（版本 / schema 不一致、被阻塞）只记入 failed，不整体中止；
 * 2. 校验错误码与 Rust 模板同源，便于两端日志对读。
 */
const IDB_RESTORE_FUNC = (payload) =>
  (async () => {
    const base64ToBytes = (value) => {
      const binary = atob(value),
        out = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
      return out
    }
    const decode = (encoded) => {
      switch (encoded.t) {
        case "null":
          return null
        case "string":
        case "boolean":
          return encoded.v
        case "undefined":
          return undefined
        case "number":
          return encoded.v === "NaN"
            ? NaN
            : encoded.v === "Infinity"
              ? Infinity
              : encoded.v === "-Infinity"
                ? -Infinity
                : encoded.v === "-0"
                  ? -0
                  : encoded.v
        case "bigint":
          return BigInt(encoded.v)
        case "date":
          return new Date(encoded.v)
        case "regexp":
          return new RegExp(encoded.v, encoded.f)
        case "arrayBuffer":
          return base64ToBytes(encoded.v).buffer
        case "typedArray": {
          const bytes = base64ToBytes(encoded.v)
          const ctor = globalThis[encoded.c]
          if (typeof ctor !== "function") throw new Error("INDEXED_DB_TYPED_ARRAY_UNSUPPORTED")
          return new ctor(bytes.buffer)
        }
        case "array":
          return encoded.v.map(decode)
        case "map":
          return new Map(encoded.v.map(([k, v]) => [decode(k), decode(v)]))
        case "set":
          return new Set(encoded.v.map(decode))
        case "object": {
          const out = {}
          for (const [key, value] of encoded.v) out[key] = decode(value)
          return out
        }
        default:
          throw new Error("INDEXED_DB_VALUE_ENCODING_UNSUPPORTED")
      }
    }
    const sameKeyPath = (left, right) => JSON.stringify(left) === JSON.stringify(right)
    const restoreDatabase = (snapshot) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open(snapshot.name, snapshot.version)
        let upgradeError = null
        request.onblocked = () => reject(new Error("INDEXED_DB_BLOCKED"))
        request.onerror = () =>
          reject(upgradeError || request.error || new Error("INDEXED_DB_OPEN_FAILED"))
        request.onupgradeneeded = () => {
          const db = request.result
          try {
            // 已存在的库不得借注入升级 schema（与 Rust 模板同款 fail-closed）。
            if (request.oldVersion !== 0) throw new Error("INDEXED_DB_SCHEMA_VERSION_MISMATCH")
            for (const storeSnapshot of snapshot.stores) {
              const store = db.createObjectStore(storeSnapshot.name, {
                keyPath: storeSnapshot.keyPath,
                autoIncrement: storeSnapshot.autoIncrement,
              })
              for (const index of storeSnapshot.indexes)
                store.createIndex(index.name, index.keyPath, {
                  unique: index.unique,
                  multiEntry: index.multiEntry,
                })
            }
          } catch (error) {
            upgradeError = error
            try {
              request.transaction.abort()
            } catch (_) {}
          }
        }
        request.onsuccess = () => {
          const db = request.result
          try {
            const expected = snapshot.stores.map((store) => store.name).sort()
            const actual = Array.from(db.objectStoreNames).sort()
            if (JSON.stringify(expected) !== JSON.stringify(actual))
              throw new Error("INDEXED_DB_STORE_SET_MISMATCH")
            const tx = db.transaction(expected, "readwrite")
            tx.oncomplete = () => {
              db.close()
              resolve()
            }
            tx.onabort = () => {
              db.close()
              reject(tx.error || new Error("INDEXED_DB_TRANSACTION_ABORTED"))
            }
            tx.onerror = () => {}
            for (const storeSnapshot of snapshot.stores) {
              const store = tx.objectStore(storeSnapshot.name)
              if (
                !sameKeyPath(store.keyPath, storeSnapshot.keyPath) ||
                store.autoIncrement !== storeSnapshot.autoIncrement
              )
                throw new Error("INDEXED_DB_STORE_SCHEMA_MISMATCH")
              const indexNames = Array.from(store.indexNames).sort()
              const expectedIndexes = storeSnapshot.indexes.map((index) => index.name).sort()
              if (JSON.stringify(indexNames) !== JSON.stringify(expectedIndexes))
                throw new Error("INDEXED_DB_INDEX_SET_MISMATCH")
              for (const indexSnapshot of storeSnapshot.indexes) {
                const index = store.index(indexSnapshot.name)
                if (
                  !sameKeyPath(index.keyPath, indexSnapshot.keyPath) ||
                  index.unique !== indexSnapshot.unique ||
                  index.multiEntry !== indexSnapshot.multiEntry
                )
                  throw new Error("INDEXED_DB_INDEX_SCHEMA_MISMATCH")
              }
              store.clear()
              for (const record of storeSnapshot.records) {
                const value = decode(record.value)
                if (store.keyPath === null) store.put(value, decode(record.key))
                else store.put(value)
              }
            }
          } catch (error) {
            db.close()
            reject(error)
          }
        }
      })
    const result = { restored: [], failed: [] }
    if (!globalThis.indexedDB) {
      result.failed.push({ name: "*", code: "INDEXED_DB_UNSUPPORTED" })
      return result
    }
    for (const database of payload.databases) {
      try {
        await restoreDatabase(database)
        result.restored.push(database.name)
      } catch (error) {
        result.failed.push({
          name: database.name,
          code:
            error && typeof error.message === "string"
              ? error.message
              : "INDEXED_DB_RESTORE_FAILED",
        })
      }
    }
    return result
  })()

const BACKUP_PREFIX = "bench:backup:"

/** I5 第二步：先备份该站点现有登录态（Cookie + Web Storage），再逐条写入。 */
async function injectSession({ accountId, url, withStorage }) {
  const exported = await exportSession(accountId)
  if (exported.outcome !== "ok") return exported

  const origin = new URL(url).origin
  // 环境一致性优先：注册 UA 覆写必须在写 Cookie 之前，保证后续请求（含站点
  // 自身的鉴权调用）立即使用会话建立时的浏览器内核标识。
  const uaOverride = await applyUaOverride(origin, exported.userAgent)

  const existing = await collectCookies(url)
  const backupKey = BACKUP_PREFIX + origin
  const backup = {
    at: Date.now(),
    origin,
    cookies: existing,
    ua: uaOverride.active ? exported.userAgent : null,
  }

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

  // 存储注入（v0.3 Web Storage / v0.5 IndexedDB）：host 权限必须在 popup 的
  // 用户手势里申请完毕，这里只检查是否已授予；未授予则降级为「仅 Cookie」
  // 并在结果里说明。
  const storage = {
    attempted: false,
    granted: false,
    writtenKeys: 0,
    writtenLocal: 0,
    writtenSession: 0,
    indexedDb: { attempted: false, backedUp: false, restored: 0, failed: [], error: null },
    error: null,
  }
  const branch = (exported.webStorage || []).find((item) => item.origin === origin)
  if (withStorage && branch) {
    const keys = (branch.localStorage || []).length + (branch.sessionStorage || []).length
    const idbDatabases = (branch.indexedDb?.databases || []).length
    if (keys > 0 || idbDatabases > 0) {
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
          storage.indexedDb = result.idb
          backup.webStorage = result.backup
        } catch (e) {
          storage.error = String(e?.message || e)
        }
      }
    }
  }
  await chrome.storage.local.set({ [backupKey]: backup })
  // 注入成功即完成同 origin 的自动注入任务（若存在），避免自动流程重复注入。
  void bridgeCall("/v1/tasks/complete", { origin }).catch(() => {})

  return {
    outcome: "injected",
    origin,
    written,
    failed,
    backupKey,
    replaced: existing.length,
    // 该账号登录态含存储快照的 origin 份数。扩展 ≥ 0.5 会写入全部三类存储；
    // 仅当上方 storage 明细显示未写成功时才需要向用户解释差异。
    storageOrigins: exported.storageOrigins || 0,
    skippedPartitioned: exported.skippedPartitioned || 0,
    storage,
    uaOverride,
  }
}

// ── 自动注入（D-032）──────────────────────────────────────────────────────
// Bench 点「同步到日常浏览器」后登记 pending 任务并打开站点页；本扩展在页面
// 加载完成时领取任务并自动完成注入，用户无需再点扩展图标。任务不含凭据
//（注入载荷仍走 /v1/session/export 双校验通道），10 分钟未完成自动过期。

/** 领取 pending 任务并对匹配的标签页自动注入。返回已完成的 origin 列表。 */
async function maybeAutoInject() {
  let pending
  try {
    pending = await bridgeCall("/v1/tasks/pending", {})
  } catch (e) {
    return { ok: false, completed: [] }
  }
  const tasks = Array.isArray(pending) ? pending : []
  const completed = []
  for (const task of tasks) {
    if (!task?.origin || !task?.accountId) continue
    let tab = null
    try {
      tab = await findTabByOrigin(task.origin)
    } catch (e) {
      tab = null
    }
    if (!tab) continue
    const granted = await chrome.permissions
      .contains({ origins: [task.origin + "/*"] })
      .catch(() => false)
    if (!granted) continue // 未授权站点：保留任务，等用户在 popup 手动完成授权注入
    try {
      await injectSession({ accountId: task.accountId, url: task.origin + "/", withStorage: true })
      completed.push(task.origin)
    } catch (e) {
      /* 单任务失败不阻断其他任务；任务保留到过期 */
    }
  }
  for (const origin of completed) {
    try {
      await bridgeCall("/v1/tasks/complete", { origin })
    } catch (e) {
      /* 完成确认失败无妨：任务 10 分钟后过期 */
    }
  }
  return { ok: true, completed }
}

/** 按 locating origin 查找已加载完成的标签页（需要 tabs 权限读取 url）。 */
async function findTabByOrigin(origin) {
  const tabs = await chrome.tabs.query({ url: origin + "/*" })
  if (tabs.length) return tabs[0]
  return null
}

// 页面加载完成 / URL 变化 → 尝试领取任务自动注入（Bench 打开站点的场景即命中）。
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!changeInfo.status && !changeInfo.url) return
  if (changeInfo.status && changeInfo.status !== "complete") return
  if (!tab?.url) return
  void maybeAutoInject()
})
// 标签页创建也触发一次（Bench 打开的新 tab 在 complete 前即可预领）。
chrome.tabs.onCreated.addListener(() => void maybeAutoInject())

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
      idbDatabases: (all[key]?.webStorage?.indexedDb?.databases || []).length,
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

/** 把备份里的 IndexedDB 快照写回本站点。返回 {restored, failed}；未授权时 restored = -1。 */
async function restoreIdbBackup(origin, idbSnapshot) {
  const databases = idbSnapshot?.databases || []
  if (!databases.length) return { restored: 0, failed: [] }
  const granted = await chrome.permissions.contains({ origins: [origin + "/*"] })
  if (!granted) return { restored: -1, failed: [] }
  const tabId = await openAndWaitTab(origin + "/")
  const result = await executeInPage(tabId, IDB_RESTORE_FUNC, [{ databases }])
  await chrome.tabs.reload(tabId)
  return { restored: (result?.restored || []).length, failed: result?.failed || [] }
}

/** 回滚：把备份里的 Cookie、Web Storage 与 IndexedDB 写回，并清掉备份。 */
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
  const idb = await restoreIdbBackup(backup.origin, backup.webStorage?.indexedDb)
  // 回滚时一并移除该站点的 UA 覆写，恢复浏览器原生 UA。
  await removeUaOverride(backup.origin)
  await chrome.storage.local.remove(key)
  return { written, storageWritten, idbRestored: idb.restored, idbFailed: idb.failed }
}

// SW 冷启动即尝试连接（首次消息到达时也会 lazy connect）
connectNative()

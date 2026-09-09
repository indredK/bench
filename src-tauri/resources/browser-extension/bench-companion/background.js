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
  return false
})

// SW 冷启动即尝试连接（首次消息到达时也会 lazy connect）
connectNative()

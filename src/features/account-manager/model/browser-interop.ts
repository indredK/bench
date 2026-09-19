/**
 * Browser interop model / 互通结果的人类可读映射（不依赖 React）。
 *
 * 后端回的 `recoveryReason` 是稳定枚举（Rust 侧见 `webview_sync::failure_reason`
 * 与 `browser_session` 的补采分支），这里统一映射成文案 —— hook（toast）与
 * dialog（上次结果）共用同一份映射，避免两处文案漂移。
 */
import type { TFunction } from "i18next"
import type { BrowserInjectStatus } from "@/lib/tauri/types/account-manager"

/** 后端 reason → i18n key 后缀（未知值一律按「未登录」解释）。 */
const REASON_KEYS: Record<string, string> = {
  notLoggedIn: "notLoggedIn",
  noSessionData: "noSessionData",
  syncFailed: "syncFailed",
  conflict: "conflict",
  // 后端在「S1 里确有会话、但补采时探针判定已未登录」时把 reason 升级为
  // staleSession（browser_session::ensure_session_for_sync）。漏了这一条会
  // 落回 notLoggedIn，把「会话过期」说成「从没登录过」，用户会去重新登录，
  // 而不是按提示刷新一次登录态。
  staleSession: "staleSession",
}

const REASON_BASE = "accountManager.browserInterop.reason"

/** 把补采失败原因翻译成一句话（无原因时按「未登录」解释）。 */
export function describeSyncReason(t: TFunction, reason?: string | null): string {
  const suffix = reason ? (REASON_KEYS[reason] ?? "notLoggedIn") : "notLoggedIn"
  return String(t(`${REASON_BASE}.${suffix}`))
}

/** 扩展回报的注入失败原因码 → i18n key 后缀。 */
const INJECT_ERROR_KEYS: Record<string, string> = {
  SITE_NOT_AUTHORIZED: "siteNotAuthorized",
  INJECT_THREW: "extensionThrew",
  TASK_EXPIRED: "taskExpired",
  BRIDGE_STATE_UNAVAILABLE: "bridgeUnavailable",
}

const INJECT_ERROR_BASE = "accountManager.browserInterop.injectError"

/**
 * 把注入回执里的 `error` 原因码翻成一句话。
 *
 * `EXPORT_*`（扩展取不到会话载荷）是一族而非一个码，单独前缀匹配；其余未知码
 * 一律按通用失败解释 —— 猜一个具体原因比说「不知道」更有害。
 */
export function describeInjectError(t: TFunction, code?: string | null): string {
  if (!code) return String(t(`${INJECT_ERROR_BASE}.unknown`))
  if (code.startsWith("EXPORT_")) return String(t(`${INJECT_ERROR_BASE}.exportFailed`))
  return String(t(`${INJECT_ERROR_BASE}.${INJECT_ERROR_KEYS[code] ?? "unknown"}`))
}

const INJECT_BASE = "accountManager.browserInterop.inject"
const RESTORE_BASE = "accountManager.browserInterop.storageRestore"

/**
 * 隔离实例注入后的存储恢复终态 → 需要警告时的一句话，无需警告时返回 null。
 *
 * `complete` / `skipped` / null（本次没有恢复脚本）都不用说话；IndexedDB 是异步
 * 落库的，`timeout` 与 `failed:<code>` 意味着页面可能已在空库上跑过自己的脚本，
 * 此时「cookie 注入成功」并不等于「站点已登录」，必须显式告诉用户。
 * reason code 原样带出：这类失败只有拿着具体码才查得动。
 */
export function describeStorageRestore(t: TFunction, status?: string | null): string | null {
  if (!status || status === "complete" || status === "skipped") return null
  if (status === "timeout") return String(t(`${RESTORE_BASE}.timeout`))
  if (status.startsWith("failed:"))
    return String(t(`${RESTORE_BASE}.failed`, { code: status.slice("failed:".length) }))
  return String(t(`${RESTORE_BASE}.unknown`, { status }))
}

/**
 * 注入回执 → 一句话。
 *
 * hook（toast）与 dialog（状态行）共用同一份映射：两处各写一遍必然漂移，
 * 而这个功能的全部问题就是「对用户说的话与实际发生的事对不上」。
 */
export function describeInjectOutcome(t: TFunction, status: BrowserInjectStatus): string {
  switch (status.outcome) {
    case "injected":
      return String(
        t(`${INJECT_BASE}.injected`, {
          cookies: status.cookiesWritten,
          keys: status.storageKeysWritten,
          idb: status.idbRestored,
        }),
      )
    case "queued":
      return String(t(`${INJECT_BASE}.queued`))
    case "claimed":
      return String(t(`${INJECT_BASE}.claimed`))
    case "failed":
      return String(t(`${INJECT_BASE}.failed`, { reason: describeInjectError(t, status.error) }))
    default:
      // `unknown`：任务已过期 / Bench 重启过，结果永久丢了 —— 不能含糊成「可能成功」。
      return String(t(`${INJECT_BASE}.unknown`))
  }
}

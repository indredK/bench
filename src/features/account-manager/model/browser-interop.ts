/**
 * Browser interop model / 互通结果的人类可读映射（不依赖 React）。
 *
 * 后端回的 `recoveryReason` 是稳定枚举（Rust 侧见 `webview_sync::failure_reason`
 * 与 `browser_session` 的补采分支），这里统一映射成文案 —— hook（toast）与
 * dialog（上次结果）共用同一份映射，避免两处文案漂移。
 */
import type { TFunction } from "i18next"

/** 后端 reason → i18n key 后缀（未知值一律按「未登录」解释）。 */
const REASON_KEYS: Record<string, string> = {
  notLoggedIn: "notLoggedIn",
  noSessionData: "noSessionData",
  syncFailed: "syncFailed",
  conflict: "conflict",
}

const REASON_BASE = "accountManager.browserInterop.reason"

/** 把补采失败原因翻译成一句话（无原因时按「未登录」解释）。 */
export function describeSyncReason(t: TFunction, reason?: string | null): string {
  const suffix = reason ? (REASON_KEYS[reason] ?? "notLoggedIn") : "notLoggedIn"
  return String(t(`${REASON_BASE}.${suffix}`))
}

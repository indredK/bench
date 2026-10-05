/**
 * Region error model / 区域错误模型:
 *   把命令错误解析统一收敛到 `parseCommandError` / `translateError`（§6 错误处理策略），
 *   并提供三栏区域（站点 / 账号 / 详情）持久化错误条所需的数据载体。
 */
import { parseCommandError, translateError } from "@/lib/tauri/errors"
import type { TFunction } from "i18next"

export type AccountManagerRegion = "station" | "account" | "detail"
export type RegionErrorScope = { stationId?: string; accountId?: string }

export interface RegionErrorPayload {
  /** 只保留稳定错误码，禁止把后端 message（可能包含 URL/账号等私密值）放入 renderer store。 */
  errorCode: string
  /** 无法从 `errors.<CODE>` 本地化时的回退 i18n key。 */
  fallbackKey: string
  /** 回退文案的插值参数。 */
  values?: Record<string, unknown>
  /** 作用对象；选择切换后不把旧对象的错误或重试入口显示给新对象。 */
  scope?: RegionErrorScope
  /** 重试或重新加载入口。 */
  retry?: () => unknown | Promise<unknown>
  /** 例如 CRUD 失败后重新读取列表，应显示“刷新”而不是“重试”。 */
  retryLabel?: "retry" | "refresh"
}

export function makeRegionError(
  error: unknown,
  fallbackKey: string,
  options?: {
    values?: Record<string, unknown>
    scope?: RegionErrorScope
    retry?: () => unknown | Promise<unknown>
    retryLabel?: "retry" | "refresh"
  },
): RegionErrorPayload {
  return {
    errorCode: parseCommandError(error).code,
    fallbackKey,
    values: options?.values,
    scope: options?.scope,
    retry: options?.retry,
    retryLabel: options?.retryLabel,
  }
}

/** 渲染期取区域错误文案：优先 `errors.<CODE>`，否则回退到 fallbackKey 文案。 */
export function describeRegionError(t: TFunction, payload: RegionErrorPayload): string {
  return translateError(
    t,
    { code: payload.errorCode, message: "" },
    t(payload.fallbackKey, payload.values),
  )
}

export function isRegionErrorVisible(
  payload: RegionErrorPayload | null,
  selectedStationId: string,
  selectedAccountId: string,
): payload is RegionErrorPayload {
  return Boolean(
    payload &&
    (!payload.scope?.stationId || payload.scope.stationId === selectedStationId) &&
    (!payload.scope?.accountId || payload.scope.accountId === selectedAccountId),
  )
}

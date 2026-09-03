/**
 * Region error model / 区域错误模型:
 *   把命令错误解析统一收敛到 `parseCommandError` / `translateError`（§6 错误处理策略），
 *   并提供三栏区域（站点 / 账号 / 详情）持久化错误条所需的数据载体。
 */
import { translateError } from "@/lib/tauri/errors"
import type { TFunction } from "i18next"

export type AccountManagerRegion = "station" | "account" | "detail"

export interface RegionErrorPayload {
  /** 原始 reject 值；渲染时经 `translateError` 归一化。 */
  error: unknown
  /** 无法从 `errors.<CODE>` 本地化时的回退 i18n key。 */
  fallbackKey: string
  /** 回退文案的插值参数。 */
  values?: Record<string, unknown>
  /** 区域级重试入口（复用该区域既有刷新函数）。 */
  retry?: () => void
}

export function makeRegionError(
  error: unknown,
  fallbackKey: string,
  options?: { values?: Record<string, unknown>; retry?: () => void },
): RegionErrorPayload {
  return { error, fallbackKey, values: options?.values, retry: options?.retry }
}

/** 渲染期取区域错误文案：优先 `errors.<CODE>`，否则回退到 fallbackKey 文案。 */
export function describeRegionError(t: TFunction, payload: RegionErrorPayload): string {
  return translateError(t, payload.error, t(payload.fallbackKey, payload.values))
}

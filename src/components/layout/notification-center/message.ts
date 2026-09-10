/**
 * Notification Center / 消息中心: render-time message resolution.
 *
 * 把 store 中的 canonical message（i18n key + 语言无关参数）解析为当前 locale 文案。
 * descriptor 参数在渲染期翻译、数组按 ", " 连接，保证语言切换后消息文案跟随 locale。
 */
import type { TFunction } from "i18next"
import type { LocalizedMessage, LocalizedParam } from "./store"

export function resolveLocalizedParam(param: LocalizedParam, t: TFunction): string {
  if (typeof param === "string" || typeof param === "number") return String(param)
  if (Array.isArray(param)) {
    return param.map((item) => resolveLocalizedParam(item, t)).join(", ")
  }
  return t(param.key, param.params as Record<string, string>)
}

export function resolveLocalizedMessage(message: LocalizedMessage, t: TFunction): string {
  const params: Record<string, string> = {}
  for (const [name, value] of Object.entries(message.params ?? {})) {
    params[name] = resolveLocalizedParam(value, t)
  }
  return t(message.key, params)
}

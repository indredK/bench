import { useTranslation } from "react-i18next"

/** 双语元数据字段（与 `MarketExtensionSummary` / `MarketInstallPreview` / `ExtensionSummary` 对应）。 */
export interface LocalizedText {
  zh?: string | null
  en?: string | null
}

/**
 * 插件元数据双语选择：按当前语言优先 zh/en（或反之），空字符串/缺失安全回退到另一语言，
 * 最后回退到 fallback。插件中心所有入口（已安装列表、市场、安装/卸载确认）共用此规则，
 * 不在模块顶层或 store 初始值调用，语言切换由 useTranslation 订阅在渲染期重算。
 */
export function selectMetadata(
  locale: string | undefined,
  values: LocalizedText,
  fallback = "",
): string {
  const isChinese = (locale ?? "").toLowerCase().split(/[-_]/)[0] === "zh"
  const choices = isChinese ? [values.zh, values.en] : [values.en, values.zh]
  return choices.find((value) => value && value.trim())?.trim() || fallback
}

/** 解析当前 i18n 语言（resolvedLanguage 优先，回退 language，再回退 en）；语言切换时自动重算。 */
export function useResolvedLocale(): string {
  const { i18n } = useTranslation()
  return i18n.resolvedLanguage || i18n.language || "en"
}

import en from "@/i18n/locales/en.json"
import zh from "@/i18n/locales/zh.json"

const TRANSLATION_BUNDLES = [en, zh] as const

/**
 * Resolve a user-facing translation only when every path segment is an own resource key.
 * i18next otherwise follows JavaScript prototypes for dynamic paths such as `*.constructor`.
 */
export function hasOwnTranslationPath(bundle: unknown, key: string): boolean {
  let value: unknown = bundle
  const segments = key.split(".")
  if (segments.length === 0 || segments.some((segment) => segment.length === 0)) return false

  for (const segment of segments) {
    if (typeof value !== "object" || value === null || !Object.hasOwn(value, segment)) {
      return false
    }
    value = (value as Record<string, unknown>)[segment]
  }

  return typeof value === "string"
}

export function hasOwnTranslationKey(key: string): boolean {
  return TRANSLATION_BUNDLES.some((bundle) => hasOwnTranslationPath(bundle, key))
}

export function safeTranslationKey(key: string, fallbackKey: string): string {
  return hasOwnTranslationKey(key) ? key : fallbackKey
}

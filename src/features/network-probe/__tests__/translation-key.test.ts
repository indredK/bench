import { describe, expect, it } from "vitest"
import en from "@/i18n/locales/en.json"
import { hasOwnTranslationPath } from "@/features/network-probe/utils/translation-key"

describe("safe dynamic translation lookup", () => {
  it("accepts existing nested string resources", () => {
    expect(hasOwnTranslationPath(en, "networkProbe.ipv6.statusValue.ok")).toBe(true)
  })

  it.each(["constructor", "toString", "__proto__", "future-status"])(
    "rejects non-resource path segment %s",
    (value) => {
      expect(hasOwnTranslationPath(en, `networkProbe.ipv6.statusValue.${value}`)).toBe(false)
    },
  )
})

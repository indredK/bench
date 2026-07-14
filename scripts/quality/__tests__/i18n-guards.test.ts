import { describe, expect, it } from "vitest"
import {
  analyzeSource,
  findDuplicateJsonKeys,
  validateLocaleObjects,
  validateTranslationUsage,
} from "../check-i18n-guards.mjs"

describe("i18n guards", () => {
  it("accepts aligned locale structures and placeholders", () => {
    const result = validateLocaleObjects(
      { common: { greeting: "Hello {{name}}" } },
      { common: { greeting: "你好 {{name}}" } },
    )

    expect(result.issues).toEqual([])
  })

  it("rejects missing keys, empty values, type changes, and placeholder drift", () => {
    const result = validateLocaleObjects(
      {
        common: {
          empty: "",
          greeting: "Hello {{name}}",
          onlyEnglish: "English",
          type: "text",
        },
      },
      {
        common: {
          empty: "",
          greeting: "你好 {{account}}",
          onlyChinese: "中文",
          type: ["text"],
        },
      },
      { emptyAllowlist: new Map() },
    )

    expect(result.issues.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "empty-value",
        "missing-key",
        "placeholder-mismatch",
        "type-mismatch",
      ]),
    )
  })

  it("detects duplicate JSON keys before JSON.parse overwrites them", () => {
    const issues = findDuplicateJsonKeys('{"common":{"save":"Save","save":"Again"}}')

    expect(issues).toEqual([expect.objectContaining({ kind: "duplicate-key", key: "common.save" })])
  })

  it("detects hardcoded JSX, visible attributes, and toast messages", () => {
    const analysis = analyzeSource(
      `
        export function Example() {
          toast.error("Save failed")
          return <button aria-label="Save item">Save</button>
        }
      `,
      "src/Example.tsx",
    )

    expect(analysis.hardcoded).toHaveLength(3)
  })

  it("allows explicit language-neutral technical tokens", () => {
    const analysis = analyzeSource(
      `export function Example() { return <><span>HTTP</span><span>/ 1M tokens</span></> }`,
      "src/Example.tsx",
    )

    expect(analysis.hardcoded).toEqual([])
  })

  it("accepts translated text and validates static and dynamic key families", () => {
    const analysis = analyzeSource(
      `
        export function Example({ mode }) {
          return <button aria-label={t("common.save")}>{t(\`theme.\${mode}\`)}</button>
        }
      `,
      "src/Example.tsx",
    )
    const localeEntries = new Map([
      ["common.save", "Save"],
      ["theme.dark", "Dark"],
    ])

    expect(validateTranslationUsage([analysis], localeEntries)).toEqual([])
    expect(analysis.staticKeys.has("common.save")).toBe(true)
  })

  it("rejects a statically referenced key that is missing from the locale", () => {
    const analysis = analyzeSource(
      `export function Example() { return <span>{t("common.missing")}</span> }`,
      "src/Example.tsx",
    )

    expect(validateTranslationUsage([analysis], new Map())).toEqual([
      expect.objectContaining({ kind: "missing-used-key", key: "common.missing" }),
    ])
  })

  it("rejects a dynamic key family with no locale matches", () => {
    const analysis = analyzeSource(
      "export function Example({ mode }) { return t(`missing.family.${mode}`) }",
      "src/Example.tsx",
    )

    expect(validateTranslationUsage([analysis], new Map())).toEqual([
      expect.objectContaining({ kind: "missing-dynamic-family" }),
    ])
  })
})

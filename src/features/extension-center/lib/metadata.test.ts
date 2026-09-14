import { describe, expect, it } from "vitest"
import { selectMetadata } from "./metadata"

describe("selectMetadata", () => {
  it("中文 locale 优先取 zh，缺失时回退 en", () => {
    expect(selectMetadata("zh", { zh: "对比", en: "Compare" })).toBe("对比")
    expect(selectMetadata("zh-CN", { zh: null, en: "Compare" })).toBe("Compare")
    expect(selectMetadata("zh", { zh: "  ", en: "Compare" })).toBe("Compare")
  })

  it("英文 locale 优先取 en，缺失时回退 zh", () => {
    expect(selectMetadata("en", { zh: "对比", en: "Compare" })).toBe("Compare")
    expect(selectMetadata("en-US", { zh: "对比", en: null })).toBe("对比")
    expect(selectMetadata("en", { zh: "对比", en: "" })).toBe("对比")
  })

  it("未知/空 locale 回退到 en 优先", () => {
    expect(selectMetadata(undefined, { zh: "对比", en: "Compare" })).toBe("Compare")
    expect(selectMetadata("", { zh: "对比", en: "Compare" })).toBe("Compare")
  })

  it("两者皆空时返回 fallback，否则空串", () => {
    expect(selectMetadata("zh", { zh: null, en: "  " }, "fallback")).toBe("fallback")
    expect(selectMetadata("en", { zh: "", en: null })).toBe("")
  })
})

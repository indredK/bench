import { describe, expect, it } from "vitest"
import { parseOverrideStorage } from "@/features/quick-launch/store"

describe("quick launch override storage", () => {
  it("loads valid versioned overrides and filters invalid entries", () => {
    const result = parseOverrideStorage(
      JSON.stringify({
        version: 1,
        overrides: {
          "app-v1-valid": "dev",
          "legacy-id": "dev",
          "app-v1-invalid-scene": "missing",
        },
      }),
    )

    expect(result).toEqual({
      overrides: { "app-v1-valid": "dev" },
      issue: null,
    })
  })

  it("fails closed for a future schema", () => {
    const result = parseOverrideStorage(
      JSON.stringify({ version: 2, overrides: { "app-v1-future": "dev" } }),
    )
    expect(result).toEqual({ overrides: {}, issue: "newerSchema" })
  })

  it("reports corrupt and oversized payloads without throwing", () => {
    expect(parseOverrideStorage("not-json")).toEqual({ overrides: {}, issue: "recovered" })
    expect(parseOverrideStorage("x".repeat(2 * 1024 * 1024 + 1))).toEqual({
      overrides: {},
      issue: "tooLarge",
    })
  })
})

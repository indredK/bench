import { describe, expect, it } from "vitest"
import { parseUnixTimestampInput } from "@/features/dev-toolbox/services/parse-unix-timestamp"

describe("parseUnixTimestampInput", () => {
  it("requires a value instead of silently converting empty input to epoch zero", () => {
    expect(parseUnixTimestampInput("")).toEqual({ ok: false, reason: "required" })
    expect(parseUnixTimestampInput(" \t ")).toEqual({ ok: false, reason: "required" })
  })

  it("accepts safe positive, zero, and negative whole seconds", () => {
    expect(parseUnixTimestampInput("1700000000")).toEqual({ ok: true, timestamp: 1_700_000_000 })
    expect(parseUnixTimestampInput("0")).toEqual({ ok: true, timestamp: 0 })
    expect(parseUnixTimestampInput("-1")).toEqual({ ok: true, timestamp: -1 })
    expect(parseUnixTimestampInput(" 42 ")).toEqual({ ok: true, timestamp: 42 })
  })

  it("rejects partial numbers, fractions, exponent notation, and unsafe integers", () => {
    for (const input of ["12abc", "1.5", "1e3", "Infinity", "9007199254740992"]) {
      expect(parseUnixTimestampInput(input), input).toEqual({ ok: false, reason: "invalid" })
    }
  })
})

import { describe, expect, it } from "vitest"
import { testRegex } from "@/features/dev-toolbox/services/regex-tester"

describe("dev-toolbox regex tester (pure)", () => {
  it("enumerates all global matches with index and value", () => {
    const result = testRegex("\\d+", "", "a1 b22 c333")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.total).toBe(3)
    expect(result.matches.map((m) => m.value)).toEqual(["1", "22", "333"])
    expect(result.matches.map((m) => m.index)).toEqual([1, 4, 8])
  })

  it("respects the case-insensitive flag", () => {
    const result = testRegex("foo", "i", "FOO bar Foo")
    expect(result.ok && result.total).toBe(2)
  })

  it("exposes numbered capture groups", () => {
    const result = testRegex("(\\w+)@(\\w+)", "", "a@b")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.matches[0].groups).toEqual([{ value: "a" }, { value: "b" }])
  })

  it("exposes named capture groups alongside numbered ones", () => {
    const result = testRegex("(?<user>\\w+)@(?<host>\\w+)", "", "bob@site")
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const named = result.matches[0].groups.find((g) => g.name === "user")
    expect(named?.value).toBe("bob")
    expect(result.matches[0].groups.filter((g) => g.name === undefined)).toHaveLength(2)
  })

  it("supports lookbehind that the Rust regex crate cannot", () => {
    const result = testRegex("(?<=\\$)\\d+", "", "cost $42")
    expect(result.ok && result.total).toBe(1)
    expect(result.ok && result.matches[0].value).toBe("42")
  })

  it("returns a structured error for an invalid pattern instead of throwing", () => {
    const result = testRegex("(unclosed", "", "abc")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe("INVALID_PATTERN")
  })

  it("returns a structured error for invalid flags", () => {
    const result = testRegex("abc", "q", "abc")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe("INVALID_PATTERN")
  })

  it("does not hang on a zero-length match (loop guard advances lastIndex)", () => {
    const result = testRegex("a*", "", "ab")
    // Without the lastIndex bump this would never terminate.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.truncated).toBe(false)
    expect(result.total).toBeGreaterThan(0)
  })

  it("truncates an overwhelming number of matches", () => {
    const result = testRegex(".", "", "x".repeat(5000))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.total).toBe(1000)
    expect(result.truncated).toBe(true)
  })

  it("does not claim an exact match limit was truncated", () => {
    const result = testRegex(".", "", "x".repeat(1000))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.total).toBe(1000)
    expect(result.truncated).toBe(false)
  })

  it("rejects oversized pattern, input, and replacement before evaluation", () => {
    expect(testRegex("x".repeat(4097), "", "x")).toEqual({
      ok: false,
      code: "PATTERN_TOO_LONG",
    })
    expect(testRegex("x", "", "x".repeat(20001))).toEqual({
      ok: false,
      code: "INPUT_TOO_LONG",
    })
    expect(testRegex("x", "", "x", "y".repeat(20001))).toEqual({
      ok: false,
      code: "REPLACEMENT_TOO_LONG",
    })
    expect(testRegex("x", "g".repeat(9), "x")).toEqual({
      ok: false,
      code: "INVALID_PATTERN",
    })
  })

  it("computes a replacement preview when a replacement is supplied", () => {
    const result = testRegex("(\\d)", "", "a1b2", "[$1]")
    expect(result.ok && result.replaced).toBe("a[1]b[2]")
  })

  it("preserves native replacement tokens", () => {
    const input = "ab ab"
    const pattern = "(?<first>a)(b)"
    const replacement = "$$:$&:$1:$2:$<first>:$`:$'"
    const result = testRegex(pattern, "", input, replacement)

    expect(result.ok && result.replaced).toBe(input.replace(new RegExp(pattern, "g"), replacement))
  })

  it.each([
    { pattern: "(a)", input: "a a", replacement: "$0|$01|$10|$2|$$" },
    { pattern: "(?<x>a)(b)?", input: "ab a", replacement: "$<x>:$<missing>:$1:$2" },
    { pattern: "(a)?b", input: "b ab", replacement: "<$1>" },
    { pattern: "a", input: "a a", replacement: "$<name>" },
  ])("matches native replacement behavior for $replacement", ({ pattern, input, replacement }) => {
    const result = testRegex(pattern, "", input, replacement)

    expect(result.ok && result.replaced).toBe(input.replace(new RegExp(pattern, "g"), replacement))
  })

  it("stops replacement templates from expanding output without bound", () => {
    const result = testRegex("(?=.)", "g", "x".repeat(3000), "$`")

    expect(result).toEqual({ ok: false, code: "REPLACEMENT_OUTPUT_TOO_LARGE" })
  })

  it("bounds the combined text returned in matches and capture groups", () => {
    const pattern = `(?=${Array.from({ length: 20 }, () => "(.*)").join("")})`
    const result = testRegex(pattern, "g", "x".repeat(20_000))

    expect(result).toEqual({ ok: false, code: "MATCH_OUTPUT_TOO_LARGE" })
  })

  it("bounds capture entry count when captures are empty", () => {
    const pattern = `(?=${"()".repeat(500)})`
    const result = testRegex(pattern, "g", "x".repeat(20))

    expect(result).toEqual({ ok: false, code: "MATCH_OUTPUT_TOO_LARGE" })
  })

  it("leaves replaced null when no replacement is provided", () => {
    const result = testRegex("\\d", "", "a1")
    expect(result.ok && result.replaced).toBeNull()
  })

  it("treats an empty pattern as a benign no-match", () => {
    const result = testRegex("", "", "anything")
    expect(result.ok && result.total).toBe(0)
  })
})

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
    expect(typeof result.error).toBe("string")
    expect(result.error.length).toBeGreaterThan(0)
  })

  it("returns a structured error for invalid flags", () => {
    const result = testRegex("abc", "q", "abc")
    expect(result.ok).toBe(false)
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

  it("computes a replacement preview when a replacement is supplied", () => {
    const result = testRegex("(\\d)", "", "a1b2", "[$1]")
    expect(result.ok && result.replaced).toBe("a[1]b[2]")
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

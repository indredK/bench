import { describe, expect, it } from "vitest"
import { extractParamNames, fillParams } from "@/features/command-center/services/command-params"

describe("command-params extractParamNames", () => {
  it("returns names in first-seen order without duplicates", () => {
    expect(extractParamNames("docker exec {{ctr}} logs {{ctr}} {{tail}}")).toEqual(["ctr", "tail"])
  })

  it("tolerates surrounding whitespace", () => {
    expect(extractParamNames("kill -9 {{ pid }}")).toEqual(["pid"])
  })

  it("returns empty for commands with no placeholders", () => {
    expect(extractParamNames("echo hello")).toEqual([])
  })

  it("does not treat shell brace expansion as a placeholder", () => {
    expect(extractParamNames("cp a{1,2} dest/")).toEqual([])
  })

  it("accepts dots, dashes and underscores in names", () => {
    expect(extractParamNames("{{db.host}} {{port-num}} {{a_b}}")).toEqual([
      "db.host",
      "port-num",
      "a_b",
    ])
  })
})

describe("command-params fillParams", () => {
  it("substitutes every occurrence", () => {
    expect(
      fillParams("ssh {{user}}@{{host}} -p {{port}}", {
        user: "root",
        host: "10.0.0.1",
        port: "22",
      }),
    ).toBe("ssh root@10.0.0.1 -p 22")
  })

  it("replaces the same placeholder multiple times", () => {
    expect(fillParams("{{x}}+{{x}}", { x: "1" })).toBe("1+1")
  })

  it("keeps unknown placeholders verbatim (never silently empties them)", () => {
    expect(fillParams("{{a}} {{b}}", { a: "1" })).toBe("1 {{b}}")
  })

  it("treats replacement values literally (no $-pattern escaping)", () => {
    expect(fillParams("{{v}}", { v: "$&$1x" })).toBe("$&$1x")
  })
})

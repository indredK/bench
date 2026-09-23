/**
 * Test / 测试: JSON Schema 校验器纯函数行为与可靠性护栏。
 */
import { describe, expect, it } from "vitest"
import { validateJsonSchema, type JsonSchemaResult } from "../services/json-schema"

function ok(result: JsonSchemaResult): Extract<JsonSchemaResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`)
  return result
}

describe("validateJsonSchema", () => {
  it("passes a conforming object against a core schema", () => {
    const schema = JSON.stringify({
      type: "object",
      required: ["id", "name"],
      properties: {
        id: { type: "integer", minimum: 1 },
        name: { type: "string", minLength: 1 },
        tags: { type: "array", items: { type: "string" }, uniqueItems: true },
      },
    })
    const data = JSON.stringify({ id: 7, name: "bench", tags: ["a", "b"] })
    const result = ok(validateJsonSchema(schema, data))
    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.unsupported).toEqual([])
  })

  it("reports a required-property miss with a JSON Pointer path", () => {
    const schema = JSON.stringify({
      type: "object",
      required: ["a"],
      properties: { a: { type: "string" } },
    })
    const result = ok(validateJsonSchema(schema, JSON.stringify({})))
    expect(result.valid).toBe(false)
    expect(result.issues).toEqual([{ path: "/a", message: "required property is missing" }])
  })

  it("flags nested type failures at the right pointer", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: { user: { type: "object", properties: { age: { type: "integer" } } } },
    })
    const result = ok(validateJsonSchema(schema, JSON.stringify({ user: { age: "old" } })))
    expect(result.issues.some((i) => i.path === "/user/age" && i.message.includes("integer"))).toBe(
      true,
    )
  })

  it("honours enum, const, and multipleOf", () => {
    expect(ok(validateJsonSchema(JSON.stringify({ enum: ["red", "green"] }), '"blue"')).valid).toBe(
      false,
    )
    expect(
      ok(validateJsonSchema(JSON.stringify({ enum: ["red", "green"] }), '"green"')).valid,
    ).toBe(true)
    expect(ok(validateJsonSchema(JSON.stringify({ const: 5 }), "5")).valid).toBe(true)
    expect(ok(validateJsonSchema(JSON.stringify({ multipleOf: 0.1 }), "0.3")).valid).toBe(true)
    expect(ok(validateJsonSchema(JSON.stringify({ multipleOf: 3 }), "10")).valid).toBe(false)
  })

  it("treats integer as rejecting non-whole numbers but type:number accepting them", () => {
    expect(ok(validateJsonSchema(JSON.stringify({ type: "integer" }), "1.5")).valid).toBe(false)
    expect(ok(validateJsonSchema(JSON.stringify({ type: "number" }), "1.5")).valid).toBe(true)
  })

  it("evaluates combinators anyOf / oneOf / allOf / not", () => {
    expect(
      ok(
        validateJsonSchema(
          JSON.stringify({ anyOf: [{ type: "string" }, { type: "number" }] }),
          '"x"',
        ),
      ).valid,
    ).toBe(true)
    // oneOf requires EXACTLY one match; string matches both => invalid.
    expect(
      ok(
        validateJsonSchema(
          JSON.stringify({ oneOf: [{ type: "string" }, { minLength: 1 }] }),
          '"x"',
        ),
      ).valid,
    ).toBe(false)
    expect(
      ok(validateJsonSchema(JSON.stringify({ allOf: [{ type: "integer" }, { minimum: 5 }] }), "3"))
        .valid,
    ).toBe(false)
    expect(ok(validateJsonSchema(JSON.stringify({ not: { type: "string" } }), '"x"')).valid).toBe(
      false,
    )
  })

  it("applies if/then/else", () => {
    const schema = JSON.stringify({
      if: { properties: { kind: { const: "a" } }, required: ["kind"] },
      then: { required: ["aOnly"] },
      else: { required: ["other"] },
    })
    expect(ok(validateJsonSchema(schema, JSON.stringify({ kind: "a", aOnly: 1 }))).valid).toBe(true)
    expect(ok(validateJsonSchema(schema, JSON.stringify({ kind: "a" }))).valid).toBe(false)
    expect(ok(validateJsonSchema(schema, JSON.stringify({ other: 1 }))).valid).toBe(true)
  })

  it("supports boolean schemas and additionalProperties:false", () => {
    expect(ok(validateJsonSchema("true", "42")).valid).toBe(true)
    expect(ok(validateJsonSchema("false", "42")).valid).toBe(false)
    const schema = JSON.stringify({
      type: "object",
      properties: { a: {} },
      additionalProperties: false,
    })
    expect(ok(validateJsonSchema(schema, JSON.stringify({ a: 1, b: 2 }))).valid).toBe(false)
    expect(ok(validateJsonSchema(schema, JSON.stringify({ a: 1 }))).valid).toBe(true)
  })

  it("resolves local $ref into $defs", () => {
    const schema = JSON.stringify({
      $defs: { pos: { type: "integer", minimum: 1 } },
      type: "object",
      properties: { n: { $ref: "#/$defs/pos" } },
    })
    expect(ok(validateJsonSchema(schema, JSON.stringify({ n: 5 }))).valid).toBe(true)
    expect(ok(validateJsonSchema(schema, JSON.stringify({ n: 0 }))).valid).toBe(false)
  })

  it("surfaces unsupported keywords instead of silently passing (design §2)", () => {
    const result = ok(validateJsonSchema(JSON.stringify({ contentEncoding: "base64" }), '"hi"'))
    expect(result.unsupported).toContain("contentEncoding")
  })

  it("flags prefixItems as unsupported rather than falsely accepting a 2020-12 tuple", () => {
    // prefixItems is NOT evaluated by this Draft-07 subset; it must be reported, not ignored.
    const result = ok(
      validateJsonSchema(
        JSON.stringify({ type: "array", prefixItems: [{ type: "string" }] }),
        JSON.stringify([1, 2]),
      ),
    )
    expect(result.unsupported).toContain("prefixItems")
  })

  it("ignores annotations without marking them unsupported", () => {
    const result = ok(
      validateJsonSchema(JSON.stringify({ title: "t", format: "email", type: "string" }), '"a@b"'),
    )
    expect(result.unsupported).toEqual([])
    expect(result.valid).toBe(true)
  })

  it("returns structured errors, never throws, on bad schema/data", () => {
    expect(validateJsonSchema("{oops", "{}")).toEqual({
      ok: false,
      error: expect.stringContaining("schema is not valid JSON"),
    })
    expect(validateJsonSchema("{}", "{oops")).toEqual({
      ok: false,
      error: expect.stringContaining("data is not valid JSON"),
    })
    expect(validateJsonSchema("", "{}")).toEqual({ ok: false, error: "schema is empty" })
    expect(validateJsonSchema('"a string"', "{}")).toEqual({
      ok: false,
      error: "schema must be a JSON object or boolean",
    })
  })

  it("validates array tuple via prefixItems-equivalent items array", () => {
    const schema = JSON.stringify({ items: [{ type: "string" }, { type: "number" }] })
    expect(ok(validateJsonSchema(schema, JSON.stringify(["a", 1]))).valid).toBe(true)
    expect(ok(validateJsonSchema(schema, JSON.stringify([1, "a"]))).valid).toBe(false)
  })
})

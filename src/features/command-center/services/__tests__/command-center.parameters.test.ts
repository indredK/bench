import { describe, expect, it } from "vitest"
import {
  MAX_COMMAND_CARD_PARAMETERS,
  MAX_COMMAND_CARD_PARAMETER_NAME_LENGTH,
  MAX_COMMAND_CARD_PARAMETER_VALUE_LENGTH,
  parseCommandTemplateParameters,
  resolveCommandTemplate,
} from "@/features/command-center/services/command-center.parameters"

describe("command card template parameters", () => {
  it("returns unique variable names in first-occurrence order", () => {
    expect(parseCommandTemplateParameters("echo {{name}} {{count}} {{name}} {{_path2}}")).toEqual({
      ok: true,
      names: ["name", "count", "_path2"],
    })
  })

  it("replaces every occurrence without trimming or changing user text", () => {
    expect(
      resolveCommandTemplate("echo '{{value}}' '{{value}}'", { value: "hello world" }),
    ).toEqual({ ok: true, command: "echo 'hello world' 'hello world'" })
  })

  it("allows empty values but rejects missing values and control characters", () => {
    expect(resolveCommandTemplate("echo {{value}}", { value: "" })).toEqual({
      ok: true,
      command: "echo ",
    })
    expect(resolveCommandTemplate("echo {{value}}", {})).toEqual({
      ok: false,
      reason: "missingValue",
    })
    expect(resolveCommandTemplate("echo {{constructor}}", {})).toEqual({
      ok: false,
      reason: "missingValue",
    })
    expect(resolveCommandTemplate("echo {{__proto__}}", {})).toEqual({
      ok: false,
      reason: "missingValue",
    })
    expect(resolveCommandTemplate("echo {{value}}", { value: "first\nsecond" })).toEqual({
      ok: false,
      reason: "invalidValue",
    })
  })

  it("fails closed on malformed or excessive placeholder syntax", () => {
    expect(parseCommandTemplateParameters("echo {{bad-name}}")).toEqual({
      ok: false,
      reason: "invalidSyntax",
    })
    const tooMany = Array.from(
      { length: MAX_COMMAND_CARD_PARAMETERS + 1 },
      (_, index) => `{{value${index}}}`,
    ).join(" ")
    expect(parseCommandTemplateParameters(tooMany)).toEqual({
      ok: false,
      reason: "tooManyParameters",
    })
  })

  it("caps individual input size before constructing the command", () => {
    expect(
      resolveCommandTemplate("echo {{value}}", {
        value: "x".repeat(MAX_COMMAND_CARD_PARAMETER_VALUE_LENGTH + 1),
      }),
    ).toEqual({ ok: false, reason: "invalidValue" })
  })

  it("rejects names beyond the documented length and commands beyond the platform limit", () => {
    expect(
      parseCommandTemplateParameters(
        `{{${"a".repeat(MAX_COMMAND_CARD_PARAMETER_NAME_LENGTH + 1)}}}`,
      ),
    ).toEqual({ ok: false, reason: "invalidSyntax" })
    expect(
      resolveCommandTemplate(`${"x".repeat(6000)}{{value}}`, {
        value: "y".repeat(2001),
      }),
    ).toEqual({ ok: false, reason: "commandTooLong" })
  })
})

export const MAX_COMMAND_CARD_PARAMETERS = 20
export const MAX_COMMAND_CARD_PARAMETER_NAME_LENGTH = 40
export const MAX_COMMAND_CARD_PARAMETER_VALUE_LENGTH = 2048
export const MAX_RESOLVED_COMMAND_LENGTH = 8000

const TOKEN_PATTERN = /\{\{([^{}]*)\}\}/gu
const NAME_PATTERN = new RegExp(
  `^[A-Za-z_][A-Za-z0-9_]{0,${MAX_COMMAND_CARD_PARAMETER_NAME_LENGTH - 1}}$`,
  "u",
)

export type CommandTemplateParameters =
  { ok: true; names: string[] } | { ok: false; reason: "invalidSyntax" | "tooManyParameters" }

export type CommandTemplateResolution =
  | { ok: true; command: string }
  | {
      ok: false
      reason:
        "invalidSyntax" | "tooManyParameters" | "missingValue" | "invalidValue" | "commandTooLong"
    }

/** Finds unique `{{name}}` tokens in first-occurrence order. */
export function parseCommandTemplateParameters(template: string): CommandTemplateParameters {
  const names: string[] = []
  const seen = new Set<string>()
  const remaining = template.replace(TOKEN_PATTERN, "")

  if (remaining.includes("{{") || remaining.includes("}}")) {
    return { ok: false, reason: "invalidSyntax" }
  }

  for (const token of template.matchAll(TOKEN_PATTERN)) {
    const name = token[1]
    if (!name || !NAME_PATTERN.test(name)) return { ok: false, reason: "invalidSyntax" }
    if (seen.has(name)) continue
    seen.add(name)
    names.push(name)
    if (names.length > MAX_COMMAND_CARD_PARAMETERS) {
      return { ok: false, reason: "tooManyParameters" }
    }
  }

  return { ok: true, names }
}

/** Resolves each template token once while preserving repeated occurrences. */
export function resolveCommandTemplate(
  template: string,
  values: Readonly<Record<string, string | undefined>>,
): CommandTemplateResolution {
  const parsed = parseCommandTemplateParameters(template)
  if (!parsed.ok) return parsed

  for (const name of parsed.names) {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      return { ok: false, reason: "missingValue" }
    }
    const value = values[name]
    if (typeof value !== "string") return { ok: false, reason: "missingValue" }
    if (
      Array.from(value).length > MAX_COMMAND_CARD_PARAMETER_VALUE_LENGTH ||
      /\p{Cc}/u.test(value)
    ) {
      return { ok: false, reason: "invalidValue" }
    }
  }

  const command = template.replace(TOKEN_PATTERN, (_token, name: string) => values[name] ?? "")
  if (command.length > MAX_RESOLVED_COMMAND_LENGTH) {
    return { ok: false, reason: "commandTooLong" }
  }
  return { ok: true, command }
}

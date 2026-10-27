export type UnixTimestampInputResult =
  { ok: true; timestamp: number } | { ok: false; reason: "required" | "invalid" }

/** Parses whole Unix seconds without silently coercing invalid input to epoch zero. */
export function parseUnixTimestampInput(input: string): UnixTimestampInputResult {
  const value = input.trim()
  if (!value) return { ok: false, reason: "required" }
  if (!/^-?\d+$/u.test(value)) return { ok: false, reason: "invalid" }

  const timestamp = Number(value)
  if (!Number.isSafeInteger(timestamp)) return { ok: false, reason: "invalid" }
  return { ok: true, timestamp }
}

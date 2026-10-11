/** Parse a decimal integer that fits the user-facing and IPC bounds. */
export function parseBoundedIntegerInput(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) return null

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}

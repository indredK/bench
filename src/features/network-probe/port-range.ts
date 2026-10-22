export const MAX_PORT_RANGE_INPUT_BYTES = 2048
export const MAX_PORT_SCAN_COUNT = 256

export type PortRangeError =
  "empty" | "invalidFormat" | "outOfRange" | "reversedRange" | "tooMany" | "tooLong"

export type PortRangeValidation =
  { valid: true; count: number } | { valid: false; error: PortRangeError }

/** Keep the renderer's port-range feedback aligned with the Rust parser. */
export function validatePortRange(spec: string): PortRangeValidation {
  if (new TextEncoder().encode(spec).byteLength > MAX_PORT_RANGE_INPUT_BYTES) {
    return { valid: false, error: "tooLong" }
  }

  const parts = spec
    .split(/[ ,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return { valid: false, error: "empty" }

  const uniquePorts = new Set<number>()
  for (const part of parts) {
    const range = /^([0-9]+)-([0-9]+)$/.exec(part)
    if (part.includes("-")) {
      if (!range) return { valid: false, error: "invalidFormat" }

      const start = Number(range[1])
      const end = Number(range[2])
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        return { valid: false, error: "outOfRange" }
      }
      if (start < 1 || end > 65_535) return { valid: false, error: "outOfRange" }
      if (start > end) return { valid: false, error: "reversedRange" }
      if (end - start + 1 > MAX_PORT_SCAN_COUNT) return { valid: false, error: "tooMany" }

      for (let port = start; port <= end; port += 1) {
        uniquePorts.add(port)
        if (uniquePorts.size > MAX_PORT_SCAN_COUNT) return { valid: false, error: "tooMany" }
      }
      continue
    }

    if (!/^[0-9]+$/.test(part)) return { valid: false, error: "invalidFormat" }
    const port = Number(part)
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      return { valid: false, error: "outOfRange" }
    }
    uniquePorts.add(port)
    if (uniquePorts.size > MAX_PORT_SCAN_COUNT) return { valid: false, error: "tooMany" }
  }

  return { valid: true, count: uniquePorts.size }
}

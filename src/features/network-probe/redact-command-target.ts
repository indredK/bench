/** Keep command hints useful without exposing URL credentials, paths, or query values. */
export function redactCommandTarget(value: string): string {
  const target = value.trim()
  if (!target) return "<empty>"

  try {
    const url = new URL(target)
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "wss:") {
      return "<redacted>"
    }

    const origin = `${url.protocol}//${url.host}`
    const path = url.pathname === "/" ? "" : "/[redacted-path]"
    const query = url.search ? "?[redacted]" : ""
    const fragment = url.hash ? "#[redacted]" : ""
    return `${origin}${path}${query}${fragment}`
  } catch {
    // Bare host/IP inputs are useful for command transparency. Reject log injection and
    // URL-like values that failed parsing instead of copying them into the command log.
    if (target.length <= 253 && /^[\p{L}\p{N}.\[\]:-]+$/u.test(target)) return target
    return "<redacted>"
  }
}

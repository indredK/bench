const HTTP_URL_PREFIX = /^https?:\/\//i

/** Keep credentials and URL query/fragment values out of hints and result details. */
export function redactProbeTargetForDisplay(value: string): string {
  const trimmed = value.trim()
  if (!HTTP_URL_PREFIX.test(trimmed)) {
    return /[?#@]/.test(trimmed) ? "…" : trimmed
  }

  try {
    const url = new URL(trimmed)
    const hasQuery = Boolean(url.search)
    const hasFragment = Boolean(url.hash)
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    return `${url.toString()}${hasQuery ? "?…" : ""}${hasFragment ? "#…" : ""}`
  } catch {
    return "…"
  }
}

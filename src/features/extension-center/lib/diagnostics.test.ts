import { describe, expect, it } from "vitest"

import { filterDiagnosticEntries, parseDiagnosticLine } from "./diagnostics"

describe("extension diagnostics", () => {
  it("parses audit and runtime records into searchable fields", () => {
    const audit = parseDiagnosticLine(
      '{"ts":"2026-10-04T10:00:00Z","event":"verify_fail","id":"sample-plugin","version":"1.2.0","reason":"bad signature"}',
      "audit",
      0,
    )
    const runtime = parseDiagnosticLine(
      '{"kind":"window-error","url":"tauri://localhost/ext/sample-plugin/index.html","message":"render failed"}',
      "runtime",
      1,
    )

    expect(audit).toMatchObject({
      kind: "verify_fail",
      extensionId: "sample-plugin",
      version: "1.2.0",
      detail: "bad signature",
      timestamp: "2026-10-04T10:00:00Z",
    })
    expect(runtime).toMatchObject({
      kind: "window-error",
      extensionId: "sample-plugin",
      detail: "render failed",
    })
    expect(filterDiagnosticEntries([audit, runtime], "window-error", "render")).toEqual([runtime])
  })

  it("keeps malformed records visible and caps long text", () => {
    const entry = parseDiagnosticLine("not-json", "runtime", 0)
    const longEntry = parseDiagnosticLine(
      JSON.stringify({ kind: "console.error", message: "x".repeat(3_000) }),
      "runtime",
      1,
    )

    expect(entry.detail).toBe("not-json")
    expect(longEntry.detail.length).toBeLessThanOrEqual(2_001)
  })
})

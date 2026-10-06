import { describe, expect, it } from "vitest"

import {
  categorizeRuntimeDiagnostics,
  countRuntimeDiagnostics,
  filterRuntimeDiagnostics,
} from "./diagnostics"

describe("runtime diagnostic records", () => {
  it("classifies known kinds and preserves unknown or legacy lines as other", () => {
    const lines = [
      JSON.stringify({ kind: "window-error", message: "render failed" }),
      JSON.stringify({ kind: "unhandled-rejection", message: "request failed" }),
      JSON.stringify({ kind: "console.error", message: "plugin error" }),
      JSON.stringify({ kind: "boot", message: "window load" }),
      JSON.stringify({ kind: "future-event", message: "new format" }),
      '{"message":"legacy record without kind"}',
      "truncated JSONL line",
    ]

    const records = categorizeRuntimeDiagnostics(lines)

    expect(records.map(({ kind }) => kind)).toEqual([
      "window-error",
      "unhandled-rejection",
      "console.error",
      "boot",
      "other",
      "other",
      "other",
    ])
    expect(records.map(({ line }) => line)).toEqual(lines)
  })

  it("counts and filters without dropping raw diagnostic lines", () => {
    const lines = [
      JSON.stringify({ kind: "window-error", message: "first" }),
      JSON.stringify({ kind: "window-error", message: "second" }),
      "legacy line",
    ]
    const records = categorizeRuntimeDiagnostics(lines)

    expect(countRuntimeDiagnostics(records)).toMatchObject({ all: 3, "window-error": 2, other: 1 })
    expect(filterRuntimeDiagnostics(records, "window-error").map(({ line }) => line)).toEqual(
      lines.slice(0, 2),
    )
    expect(filterRuntimeDiagnostics(records, "other").map(({ line }) => line)).toEqual([
      "legacy line",
    ])
    expect(filterRuntimeDiagnostics(records, "all")).toEqual(records)
  })
})

import { describe, expect, it } from "vitest"
import { buildEnvSnapshot, redactUserPaths } from "@/features/env-detector/services/env-snapshot"
import type { EnvTool } from "@/lib/tauri/types"

function tool(overrides: Partial<EnvTool> = {}): EnvTool {
  return {
    name: "node",
    version: "v24.0.0",
    path: "/usr/local/bin/node",
    size_bytes: 0,
    size_display: "",
    install_time: "",
    available: true,
    category: "runtime",
    source: "path-scan",
    kind: "cli",
    status: "",
    detector: "which",
    all_paths: [],
    issue: "",
    ...overrides,
  }
}

describe("env-snapshot redactUserPaths", () => {
  it("redacts a macOS home prefix and keeps the relative subpath", () => {
    expect(redactUserPaths("/Users/apple/.nvm/versions/node/bin/node")).toBe(
      "<HOME>/.nvm/versions/node/bin/node",
    )
  })

  it("redacts a Linux home prefix", () => {
    expect(redactUserPaths("/home/carol/.cargo/bin/rustc")).toBe("<HOME>/.cargo/bin/rustc")
  })

  it("redacts a Windows home prefix (backslash)", () => {
    expect(redactUserPaths("C:\\Users\\Bob\\AppData\\npm\\node.exe")).toBe(
      "<HOME>\\AppData\\npm\\node.exe",
    )
  })

  it("never leaks the username", () => {
    const out = redactUserPaths("/Users/s3cr3tuser/tools")
    expect(out).not.toContain("s3cr3tuser")
  })

  it("leaves system paths untouched", () => {
    expect(redactUserPaths("/usr/local/bin/node")).toBe("/usr/local/bin/node")
    expect(redactUserPaths("/Applications/Foo.app")).toBe("/Applications/Foo.app")
  })
})

describe("env-snapshot buildEnvSnapshot", () => {
  it("returns empty string for no tools", () => {
    expect(buildEnvSnapshot([])).toBe("")
  })

  it("lists each tool with availability mark, version and redacted path", () => {
    const snapshot = buildEnvSnapshot([
      tool({ name: "node", version: "v24.0.0", path: "/Users/apple/.nvm/node" }),
      tool({ name: "python", available: false, path: "", version: "" }),
    ])
    const lines = snapshot.split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe("[x] node | v24.0.0 | <HOME>/.nvm/node")
    expect(lines[1]).toBe("[ ] python | - | -")
  })

  it("produces no translatable prose and no raw username", () => {
    const snapshot = buildEnvSnapshot([tool({ path: "/Users/dana/x" })])
    expect(snapshot).not.toContain("dana")
    expect(snapshot).toContain("<HOME>/x")
  })
})

import { describe, expect, it } from "vitest"
import { diffEnvTools } from "@/features/env-detector/services/env-diff"
import type { EnvTool } from "@/lib/tauri/types"

function tool(name: string, version: string): EnvTool {
  return {
    name,
    version,
    path: "",
    size_bytes: 0,
    size_display: "",
    install_time: "",
    available: true,
    category: "",
    source: "",
    kind: "",
    status: "",
    detector: "",
    all_paths: [],
    issue: "",
  }
}

describe("diffEnvTools", () => {
  it("reports nothing on a first scan (empty previous)", () => {
    expect(diffEnvTools([], [tool("node", "v20")]).isEmpty).toBe(true)
  })

  it("reports nothing when either side is empty (failed rescan)", () => {
    expect(diffEnvTools([tool("node", "v20")], []).isEmpty).toBe(true)
  })

  it("detects added, removed and version-changed tools", () => {
    const prev = [tool("node", "v18"), tool("git", "2.40"), tool("python", "3.11")]
    const curr = [tool("node", "v20"), tool("python", "3.11"), tool("rustc", "1.9")]
    const diff = diffEnvTools(prev, curr)
    expect(diff.added.map((t) => t.name)).toEqual(["rustc"])
    expect(diff.removed.map((t) => t.name)).toEqual(["git"])
    expect(diff.changed).toEqual([{ name: "node", from: "v18", to: "v20" }])
    expect(diff.isEmpty).toBe(false)
  })

  it("isEmpty true when the two scans match", () => {
    const same = [tool("node", "v20"), tool("git", "2.40")]
    expect(diffEnvTools(same, [...same]).isEmpty).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import { renderCiEnvManifest } from "@/features/env-detector/services/env-ci"
import type { EnvTool } from "@/lib/tauri/types"

function tool(overrides: Partial<EnvTool> = {}): EnvTool {
  return {
    name: "node",
    version: "",
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
    ...overrides,
  }
}

describe("renderCiEnvManifest", () => {
  it("lists available, versioned tools as `name version`", () => {
    const out = renderCiEnvManifest([
      tool({ name: "node", version: "20.11.0" }),
      tool({ name: "python", version: "3.11.0" }),
    ])
    expect(out).toBe("node 20.11.0\npython 3.11.0")
  })

  it("strips a leading v/V from versions", () => {
    expect(renderCiEnvManifest([tool({ name: "node", version: "v24.18.0" })])).toBe("node 24.18.0")
  })

  it("skips unavailable tools and tools without a version", () => {
    const out = renderCiEnvManifest([
      tool({ name: "go", version: "1.22", available: false }),
      tool({ name: "make", version: "" }),
      tool({ name: "rust", version: "1.78" }),
    ])
    expect(out).toBe("rust 1.78")
  })

  it("dedupes by name, keeping the first versioned entry", () => {
    const out = renderCiEnvManifest([
      tool({ name: "node", version: "20.1" }),
      tool({ name: "node", version: "18.0" }),
    ])
    expect(out).toBe("node 20.1")
  })

  it("returns empty string when nothing qualifies", () => {
    expect(renderCiEnvManifest([])).toBe("")
    expect(renderCiEnvManifest([tool({ name: "x", version: "" })])).toBe("")
  })
})

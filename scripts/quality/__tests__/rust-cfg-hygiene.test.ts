import { describe, expect, it } from "vitest"

import { analyzeRustSources, applyRuleBFixesToContent } from "../check-rust-cfg-hygiene.mjs"

const SRC = "/virtual/src"
const ROOT = "/virtual"

function run(files) {
  return analyzeRustSources(
    Object.entries(files).map(([name, content]) => ({
      path: `${SRC}/${name}`,
      content,
    })),
    { srcDir: SRC, displayRoot: ROOT },
  )
}

describe("Rust cfg hygiene guard", () => {
  it("flags a const only referenced inside a macOS cfg block", () => {
    const { violations } = run({
      "preview.rs": `
const SIPS_TIMEOUT: u64 = 60;

fn make_proxy() -> bool {
    #[cfg(target_os = "macos")]
    {
        run(SIPS_TIMEOUT)
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}
`,
    })

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ rule: "A", name: "SIPS_TIMEOUT", kind: "const" })
    expect(violations[0].detail).toContain("windows")
  })

  it("flags an import plus its source const when both are only used on macOS", () => {
    const { violations } = run({
      "scan.rs": `pub const IMG_MAX_EDGE: u32 = 1600;`,
      "preview.rs": `
use super::scan::{fresh, IMG_MAX_EDGE};

fn make_proxy() -> u32 {
    #[cfg(target_os = "macos")]
    {
        IMG_MAX_EDGE
    }
    #[cfg(not(target_os = "macos"))]
    {
        0
    }
}
`,
    })

    const names = violations.map((v) => `${v.file}:${v.name}`).sort()
    expect(names).toEqual(["src/preview.rs:IMG_MAX_EDGE", "src/scan.rs:IMG_MAX_EDGE"])
  })

  it("flags `let mut` whose only reassignment is platform-gated", () => {
    const { violations } = run({
      "poster.rs": `
fn make_poster() -> bool {
    let mut made = false;
    #[cfg(target_os = "macos")]
    {
        made = true;
    }
    made
}
`,
    })

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ rule: "B", name: "made" })
  })

  it("accepts complementary macOS and Windows call sites", () => {
    const { violations } = run({
      "exec.rs": `
fn run_shell_output(cmd: &str) -> bool { !cmd.is_empty() }

#[cfg(target_os = "macos")]
pub fn run_shell() -> bool { run_shell_output("sh") }

#[cfg(target_os = "windows")]
pub fn run_shell() -> bool { run_shell_output("pwsh") }
`,
    })

    expect(violations).toEqual([])
  })

  it("accepts a cfg-gated module referenced only from a cfg-gated block", () => {
    const { violations } = run({
      "lib.rs": `
#[cfg(target_os = "macos")]
mod macos_webview;

fn setup() {
    #[cfg(target_os = "macos")]
    macos_webview::schedule(main_window());
}
`,
      "macos_webview.rs": `pub fn schedule() {}`,
    })

    expect(violations).toEqual([])
  })

  it("accepts a binding exempted by cfg_attr allow(unused_mut)", () => {
    const { violations } = run({
      "probe.rs": `
fn build() -> u32 {
    #[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(unused_mut))]
    let mut b = 1;
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        b = 2;
    }
    b
}
`,
    })

    expect(violations).toEqual([])
  })

  it("accepts items used unconditionally", () => {
    const { violations } = run({
      "plain.rs": `
const LIMIT: usize = 10;

fn take() -> usize { LIMIT }
`,
    })

    expect(violations).toEqual([])
  })

  it("exposes letStart/nameEnd on Rule B violations for the auto-fixer", () => {
    const { violations } = run({
      "poster.rs": `
fn make_poster() -> bool {
    let mut made = false;
    #[cfg(target_os = "macos")]
    {
        made = true;
    }
    made
}
`,
    })

    const ruleB = violations.filter((v) => v.rule === "B")
    expect(ruleB).toHaveLength(1)
    expect(ruleB[0]).toMatchObject({ name: "made" })
    expect(typeof ruleB[0].letStart).toBe("number")
    expect(typeof ruleB[0].nameEnd).toBe("number")
    expect(ruleB[0].nameEnd).toBeGreaterThan(ruleB[0].letStart)
  })
})

describe("Rust cfg hygiene auto-fix (Rule B)", () => {
  it("removes `mut` from the bound name and reports the new content", () => {
    const content = `fn build() -> u32 {
    let mut made = 0u32;
    made
}
`
    // Offset comes from a real analysis of the same source so we don't have
    // to hand-compute it.
    const { violations } = run({ "preview.rs": content })
    const ruleB = violations.filter((v) => v.rule === "B")
    expect(ruleB).toHaveLength(0) // no cfg gating → no Rule B violation

    // Now force a Rule B by adding a cfg block to the content and re-run.
    const gated = content.replace(
      "let mut made = 0u32;",
      'let mut made = 0u32;\n    #[cfg(target_os = "macos")]\n    { made = 1; }',
    )
    const { violations: gatedViolations } = run({ "preview.rs": gated })
    const [v] = gatedViolations.filter((x) => x.rule === "B")
    expect(v).toBeDefined()

    const { content: fixed, fixedCount } = applyRuleBFixesToContent(gated, [v])
    expect(fixedCount).toBe(1)
    expect(fixed).toContain("let made = 0u32;")
    expect(fixed).not.toMatch(/\blet\s+mut\s+made\b/)
  })

  it("is idempotent — re-running yields fixedCount=0", () => {
    const gated = `fn build() -> u32 {
    let mut made = 0u32;
    #[cfg(target_os = "macos")]
    { made = 1; }
    made
}
`
    const { violations } = run({ "preview.rs": gated })
    const [v] = violations.filter((x) => x.rule === "B")
    const { content: first } = applyRuleBFixesToContent(gated, [v])
    // Re-derive offsets from the FIXED content (which now has no `mut`, so
    // the regex no longer matches → no violations → fixedCount=0).
    const { violations: afterViolations } = run({ "preview.rs": first })
    const stillRuleB = afterViolations.filter((x) => x.rule === "B")
    expect(stillRuleB).toEqual([])
  })

  it("applies multiple Rule B fixes in reverse offset order without shifting later offsets", () => {
    const gated = `fn build() -> u32 {
    let mut a = 0u32;
    let mut b = 0u32;
    let mut c = 0u32;
    #[cfg(target_os = "macos")]
    { a = 1; b = 2; c = 3; }
    a + b + c
}
`
    const { violations } = run({ "preview.rs": gated })
    const ruleB = violations.filter((v) => v.rule === "B")
    expect(ruleB.map((v) => v.name)).toEqual(["a", "b", "c"])

    const { content: fixed, fixedCount } = applyRuleBFixesToContent(gated, ruleB)
    expect(fixedCount).toBe(3)
    expect(fixed).toContain("let a = 0u32;")
    expect(fixed).toContain("let b = 0u32;")
    expect(fixed).toContain("let c = 0u32;")
    expect(fixed).not.toMatch(/\blet\s+mut\s+[abc]\b/)
  })

  it("ignores Rule A violations — they require human judgment", () => {
    const content = `const SIPS_TIMEOUT: u64 = 60;

fn make_proxy() -> bool {
    #[cfg(target_os = "macos")]
    { run(SIPS_TIMEOUT); true }
    #[cfg(not(target_os = "macos"))]
    { false }
}
`
    const { violations } = run({ "preview.rs": content })
    const ruleA = violations.filter((v) => v.rule === "A")
    expect(ruleA).toHaveLength(1)

    const { content: fixed, fixedCount } = applyRuleBFixesToContent(content, ruleA)
    expect(fixedCount).toBe(0)
    expect(fixed).toBe(content)
  })
})
